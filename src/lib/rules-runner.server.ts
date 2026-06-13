import prisma from "@/lib/prisma.server";
import { getGoogleTokenForUser } from "@/lib/gmail/accounts.server";
import {
  actOnEmail,
  createLabel,
  getFullEmail,
  getProfileHistoryId,
  listAddedMessageIds,
  listLabels,
  modifyMessageLabels,
  sendEmail,
  type FullEmail,
} from "@/lib/gmail/api.server";
import {
  matchesRule,
  type Action,
  type Condition,
  type MatchMode,
  type RuleMessage,
} from "@/lib/rules";

type EnabledRule = {
  id: string;
  accountIds: string[];
  match: MatchMode;
  conditions: Condition[];
  actions: Action[];
};

export type RunSummary = {
  users: number;
  accounts: number;
  processed: number;
  matched: number;
  actions: number;
};

/**
 * The rules runner. For each user with enabled rules, walks each Google account's
 * Gmail history since the last cursor (GmailWatermark), matches newly-arrived
 * messages against the rules, and applies their actions via gmail.modify. Safe
 * to call on a schedule — it only sees messages added since the last run.
 */
export async function runAllRules(): Promise<RunSummary> {
  const ruleRows = await prisma.rule.findMany({ where: { enabled: true } });

  const byUser = new Map<string, EnabledRule[]>();
  for (const row of ruleRows) {
    const rule: EnabledRule = {
      id: row.id,
      accountIds: row.accountIds,
      match: (row.match as MatchMode) ?? "all",
      conditions: (row.conditions as unknown as Condition[]) ?? [],
      actions: (row.actions as unknown as Action[]) ?? [],
    };
    const list = byUser.get(row.userId) ?? [];
    list.push(rule);
    byUser.set(row.userId, list);
  }

  const summary: RunSummary = {
    users: 0,
    accounts: 0,
    processed: 0,
    matched: 0,
    actions: 0,
  };

  for (const [userId, rules] of byUser) {
    summary.users++;
    let ok = true;
    try {
      const linked = await prisma.account.findMany({
        where: { userId, providerId: "google" },
        select: { accountId: true },
      });
      const allAccountIds = linked.map((a) => a.accountId);
      const targets = new Set<string>();
      for (const rule of rules) {
        (rule.accountIds.length ? rule.accountIds : allAccountIds).forEach(
          (id) => targets.add(id),
        );
      }

      for (const accountId of targets) {
        const token = await getGoogleTokenForUser(userId, accountId);
        if (!token) continue;
        const applicable = rules.filter(
          (r) => !r.accountIds.length || r.accountIds.includes(accountId),
        );
        if (!applicable.length) continue;
        try {
          const res = await runAccount(userId, accountId, token, applicable);
          summary.accounts++;
          summary.processed += res.processed;
          summary.matched += res.matched;
          summary.actions += res.actions;
        } catch {
          ok = false;
        }
      }
    } catch {
      ok = false;
    }

    await prisma.rule.updateMany({
      where: { id: { in: rules.map((r) => r.id) } },
      data: { lastRunAt: new Date(), lastRunStatus: ok ? "ok" : "error" },
    });
  }

  return summary;
}

async function setWatermark(
  userId: string,
  accountId: string,
  historyId: string,
) {
  await prisma.gmailWatermark.upsert({
    where: { userId_accountId: { userId, accountId } },
    create: { userId, accountId, historyId },
    update: { historyId },
  });
}

async function runAccount(
  userId: string,
  accountId: string,
  token: string,
  rules: EnabledRule[],
): Promise<{ processed: number; matched: number; actions: number }> {
  const empty = { processed: 0, matched: 0, actions: 0 };

  const watermark = await prisma.gmailWatermark.findUnique({
    where: { userId_accountId: { userId, accountId } },
  });
  // First time we see this account: record where we are and process nothing,
  // so we never retroactively act on the whole existing inbox.
  if (!watermark?.historyId) {
    await setWatermark(userId, accountId, await getProfileHistoryId(token));
    return empty;
  }

  const result = await listAddedMessageIds(token, watermark.historyId);
  if (result === "expired") {
    await setWatermark(userId, accountId, await getProfileHistoryId(token));
    return empty;
  }
  if (result.messageIds.length === 0) {
    await setWatermark(userId, accountId, result.historyId);
    return empty;
  }

  // Resolve user labels once per account — for the `label` condition (by name)
  // and the "apply label" action (which needs a label id).
  const labels = await listLabels(token);
  const idByName = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));
  const nameById = new Map(labels.map((l) => [l.id, l.name]));
  const ensureLabelId = async (name: string): Promise<string | null> => {
    const found = idByName.get(name.toLowerCase());
    if (found) return found;
    const created = await createLabel(token, name);
    idByName.set(name.toLowerCase(), created.id);
    return created.id;
  };

  let matched = 0;
  let actions = 0;
  for (const id of result.messageIds) {
    let email: FullEmail;
    try {
      email = await getFullEmail(token, id);
    } catch {
      continue; // message vanished (deleted) between history and fetch
    }
    const message: RuleMessage = {
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.body,
      hasAttachment: email.hasAttachment,
      labelIds: email.labelIds,
      labelNames: email.labelIds
        .map((labelId) => nameById.get(labelId))
        .filter((n): n is string => Boolean(n)),
    };
    for (const rule of rules) {
      if (!matchesRule(rule, message)) continue;
      matched++;
      actions += await applyActions(
        token,
        id,
        email,
        rule.actions,
        ensureLabelId,
      );
    }
  }

  await setWatermark(userId, accountId, result.historyId);
  return { processed: result.messageIds.length, matched, actions };
}

async function applyActions(
  token: string,
  id: string,
  email: FullEmail,
  actions: Action[],
  ensureLabelId: (name: string) => Promise<string | null>,
): Promise<number> {
  let count = 0;
  for (const action of actions) {
    try {
      switch (action.type) {
        case "label": {
          if (!action.value) break;
          const labelId = await ensureLabelId(action.value);
          if (labelId) await modifyMessageLabels(token, id, [labelId], []);
          break;
        }
        case "archive":
          await actOnEmail(token, id, "archive");
          break;
        case "star":
          await actOnEmail(token, id, "star");
          break;
        case "trash":
          await actOnEmail(token, id, "trash");
          break;
        case "markRead":
          await modifyMessageLabels(token, id, [], ["UNREAD"]);
          break;
        case "forward":
          if (!action.value) break;
          await sendEmail(token, {
            to: action.value,
            subject: /^fwd:/i.test(email.subject)
              ? email.subject
              : `Fwd: ${email.subject}`,
            body: email.body,
            html: email.bodyHtml,
          });
          break;
        case "webhook":
          if (!action.value) break;
          await fetch(action.value, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              event: "rule.match",
              message: {
                id,
                from: email.from,
                to: email.to,
                subject: email.subject,
                snippet: email.snippet ?? "",
              },
            }),
          });
          break;
      }
      count++;
    } catch {
      // One failing action shouldn't abort the rest of the rule.
    }
  }
  return count;
}
