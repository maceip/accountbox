/**
 * IncomingItem — the workbench's unit of "something arrived for you."
 *
 * Every source ultimately delivers items: Gmail messages, GitHub PRs and
 * issues, Linear tickets someday. This is ThreadRowEmail promoted to carry a
 * source and tags, so one list surface (FeedRow/FeedList) can render any of
 * them, and row actions become data (descriptors) instead of hard-coded
 * per-source menus.
 *
 * Feeds stay live-proxy: mapping happens at render time over React Query
 * data; nothing here persists anything.
 */

import type { ThreadRowEmail } from "@/components/mail/thread-row";
import type { GithubIssue, PullRequest } from "@/lib/github/github-queries";

export type ItemTone = "neutral" | "positive" | "negative" | "attention";

export type IncomingItem = {
  id: string;
  /** Source id from the registry (gmail, github, …). */
  source: string;
  /** Where it came from: sender for mail, repo#num for GitHub. */
  from: string;
  title: string;
  /** ISO date of the latest activity. */
  date: string;
  preview?: string;
  unread?: boolean;
  /** Small colored chip: review state, issue state, … */
  status?: { label: string; tone: ItemTone };
  /** Label pills (Gmail user labels, GitHub labels). */
  tags?: string[];
  /** External detail link (GitHub); in-app items omit it and open a pane. */
  url?: string;
};

/** A row/context-menu action as data — the source contributes these, the row
 *  surface renders them. */
export type IncomingItemAction = {
  id: string;
  label: string;
  destructive?: boolean;
  /** Start a new menu group at this action. */
  separatorBefore?: boolean;
  run: () => void | Promise<void>;
};

/** What a list surface needs from any source's feed (implemented over the
 *  existing React Query hooks — mail-queries and github-queries). */
export type FeedSnapshot = {
  /** null while loading. */
  items: IncomingItem[] | null;
  error: string | null;
  refetch: () => void;
};

/* ------------------------------- Gmail ---------------------------------- */

/** Gmail's row verbs as descriptors. `onOpen` opens the reader; reply/forward
 *  open it and then signal the mounted ReaderPane. The two-frame wait exists
 *  because the pane attaches its listener in a passive effect (after paint) —
 *  a synchronous dispatch would fire before anyone is listening. */
export function gmailRowActions({
  email,
  accountId,
  onOpen,
}: {
  email: ThreadRowEmail;
  accountId?: string;
  onOpen?: () => void;
}): IncomingItemAction[] {
  const openThen = (eventName: "start-reply" | "start-forward") => {
    onOpen?.();
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: { accountId, emailId: email.id },
          }),
        ),
      ),
    );
  };
  return [
    {
      id: "mark-read",
      label: "Mark as read",
      run: async () => {
        if (!accountId) return;
        const { markEmailsRead } = await import("@/lib/mail-queries");
        await markEmailsRead(accountId, [email.id]);
      },
    },
    { id: "reply", label: "Reply", run: () => openThen("start-reply") },
    { id: "forward", label: "Forward", run: () => openThen("start-forward") },
    {
      id: "trash",
      label: "Trash",
      destructive: true,
      separatorBefore: true,
      run: async () => {
        if (!accountId) return;
        const { actOnEmail } = await import("@/lib/mail-queries");
        await actOnEmail(accountId, email.id, "trash");
      },
    },
    {
      id: "copy-id",
      label: "Copy id",
      run: async () => {
        const { toast } = await import("sonner");
        try {
          await navigator.clipboard.writeText(email.id);
          toast("Copied message ID");
        } catch {
          toast.error("Couldn't copy ID.");
        }
      },
    },
  ];
}

export function emailToItem(email: ThreadRowEmail): IncomingItem {
  return {
    id: email.id,
    source: "gmail",
    from: email.from,
    title: email.subject || "(no subject)",
    date: email.date,
    preview: email.snippet,
    unread: email.unread ?? false,
    tags: email.labelIds?.filter((l) => !l.startsWith("CATEGORY_")),
  };
}

/* ------------------------------- GitHub --------------------------------- */

function prStatus(pr: PullRequest): IncomingItem["status"] {
  if (pr.state === "merged") return { label: "merged", tone: "positive" };
  if (pr.state === "closed") return { label: "closed", tone: "negative" };
  if (pr.state === "draft") return { label: "draft", tone: "neutral" };
  if (pr.awaitsYou) return { label: "needs you", tone: "attention" };
  if (pr.review === "approved") return { label: "approved", tone: "positive" };
  if (pr.review === "changes") return { label: "changes", tone: "negative" };
  if (pr.review === "commented") return { label: "commented", tone: "neutral" };
  return { label: "review", tone: "neutral" };
}

export function prToItem(pr: PullRequest): IncomingItem {
  const parts = [
    `${pr.branch} → ${pr.base}`,
    `+${pr.additions.toLocaleString()} −${pr.deletions.toLocaleString()}`,
  ];
  if (pr.ci !== "none") parts.push(`ci ${pr.ci}`);
  if (pr.comments > 0)
    parts.push(`${pr.comments} comment${pr.comments === 1 ? "" : "s"}`);
  return {
    id: pr.id,
    source: "github",
    from: `${pr.repo} #${pr.num}`,
    title: pr.title,
    date: pr.updated,
    preview: parts.join(" · "),
    // "Unread" for a PR = it's waiting on you; same emphasis the mail row uses.
    unread: pr.awaitsYou,
    status: prStatus(pr),
    tags: pr.labels.map((l) => l.name),
    url: pr.url,
  };
}

export function issueToItem(issue: GithubIssue): IncomingItem {
  return {
    id: issue.id,
    source: "github",
    from: `${issue.repo} #${issue.num}`,
    title: issue.title,
    date: issue.updated,
    preview:
      issue.comments > 0
        ? `${issue.comments} comment${issue.comments === 1 ? "" : "s"}`
        : undefined,
    unread: issue.assignedToYou,
    status: issue.assignedToYou
      ? { label: "assigned", tone: "attention" }
      : issue.state === "closed"
        ? { label: "closed", tone: "positive" }
        : { label: "opened", tone: "neutral" },
    tags: issue.labels.map((l) => l.name),
    url: issue.url,
  };
}

/* ---------------------------- Merged feed ------------------------------- */

/** Merge per-source item lists into one feed, newest first. Items whose dates
 *  don't parse sink to the end; ties keep input order (groups in the order
 *  passed), so the result is deterministic. Pure — the Incoming panel calls
 *  this at render time over React Query data. */
export function mergeIncoming(...groups: IncomingItem[][]): IncomingItem[] {
  return groups
    .flat()
    .map((item, index) => ({ item, index, time: Date.parse(item.date) }))
    .sort((a, b) => {
      const at = Number.isNaN(a.time) ? Number.NEGATIVE_INFINITY : a.time;
      const bt = Number.isNaN(b.time) ? Number.NEGATIVE_INFINITY : b.time;
      return bt - at || a.index - b.index;
    })
    .map((entry) => entry.item);
}
