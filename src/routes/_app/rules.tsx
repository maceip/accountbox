import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckIcon, GitBranch, PlusIcon, Spline, XIcon } from "lucide-react";

import type { Account } from "@/lib/account";
import { AccountDot, useAccountColor } from "@/components/account-dot";
import { formatRelative } from "@/lib/format";
import { useAccountsQuery, useLabelsQuery } from "@/lib/mail-queries";
import {
  createRule,
  deleteRule,
  previewRule,
  rulesQueryKey,
  setRuleEnabled,
  updateRule,
  useRulesQuery,
  type RuleInput,
  type RulePreview,
} from "@/lib/rule-queries";
import {
  describeRule,
  isRuleValid,
  type Action,
  type ActionType,
  type Condition,
  type ConditionField,
  type MatchMode,
  type Rule,
} from "@/lib/rules";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/rules")({
  component: RulesPage,
});

type Option = { value: string; label: string };

const FIELD_OPTIONS: Option[] = [
  { value: "from", label: "sender" },
  { value: "to", label: "recipient" },
  { value: "subject", label: "subject" },
  { value: "hasAttachment", label: "has an attachment" },
  { value: "label", label: "label" },
];
const TEXT_OPERATOR_OPTIONS: Option[] = [
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
  { value: "is", label: "is exactly" },
  { value: "startsWith", label: "starts with" },
];
const SUBJECT_OPERATOR_OPTIONS: Option[] = [
  ...TEXT_OPERATOR_OPTIONS,
  { value: "endsWith", label: "ends with" },
];
const LABEL_OPERATOR_OPTIONS: Option[] = [
  { value: "is", label: "is" },
  { value: "isNot", label: "is not" },
];
const ACTION_OPTIONS: Option[] = [
  { value: "label", label: "Apply label" },
  { value: "archive", label: "Archive" },
  { value: "star", label: "Star" },
  { value: "markRead", label: "Mark as read" },
  { value: "trash", label: "Trash" },
  { value: "forward", label: "Forward" },
  { value: "webhook", label: "Trigger webhook" },
];
const ACTION_HINT: Partial<Record<ActionType, string>> = {
  archive: "removes from inbox",
  star: "stars the message",
  markRead: "marks as read",
  trash: "deletes the message",
};

const GRID =
  "grid grid-cols-[74px_minmax(170px,280px)_minmax(260px,1fr)_132px_112px] items-center gap-4";

const operatorOptionsFor = (field: ConditionField): Option[] => {
  if (field === "label") return LABEL_OPERATOR_OPTIONS;
  if (field === "subject") return SUBJECT_OPERATOR_OPTIONS;
  return TEXT_OPERATOR_OPTIONS;
};

const emptyCondition = (field: ConditionField = "from"): Condition => ({
  field,
  operator: field === "hasAttachment" || field === "label" ? "is" : "contains",
  value: field === "hasAttachment" ? "true" : "",
});

function RulesPage() {
  const accounts = useAccountsQuery(true).data ?? [];
  const rules = useRulesQuery(true).data ?? [];
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const active = rules.filter((rule) => rule.enabled).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b px-5">
        <h1 className="text-[18px] leading-none font-semibold tracking-[-0.35px]">
          Rules
        </h1>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {active} active · {rules.length} total · run in order
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          New rule
        </Button>
      </header>

      {rules.length === 0 ? (
        <EmptyRules onStart={() => setEditing("new")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              GRID,
              "sticky top-0 z-10 h-[34px] border-b bg-background px-5 font-mono text-[10.5px] tracking-[0.45px] text-muted-foreground/70 uppercase",
            )}
          >
            <span>Active</span>
            <span>Rule</span>
            <span>When → do</span>
            <span>Accounts</span>
            <span className="text-right">Last run</span>
          </div>
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              accounts={accounts}
              onEdit={() => setEditing(rule)}
            />
          ))}
          <div className="border-t px-5 py-3">
            <p className="font-mono text-[10.5px] text-muted-foreground/60">
              triggered by the same history poll as webhooks · actions fire via gmail.modify
            </p>
            <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground/40">
              the background runner isn’t live yet — rules save and preview, but won’t fire until it ships
            </p>
          </div>
        </div>
      )}

      {editing !== null && (
        <RuleModal
          rule={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyRules({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <Spline className="size-5 text-muted-foreground/60" />
      <p className="text-[13px] text-muted-foreground">No rules yet</p>
      <Button size="sm" variant="outline" className="mt-1" onClick={onStart}>
        Create your first rule
      </Button>
    </div>
  );
}

function RuleRow({
  rule,
  accounts,
  onEdit,
}: {
  rule: Rule;
  accounts: Account[];
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => setRuleEnabled(rule.id, !rule.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  });

  const dots = rule.accountIds.length ? rule.accountIds : accounts.map((a) => a.accountId);
  const errored = rule.lastRunStatus && rule.lastRunStatus !== "ok";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => e.key === "Enter" && onEdit()}
      className={cn(
        GRID,
        "h-11 cursor-pointer border-b px-5 text-left transition-colors hover:bg-muted/35",
        !rule.enabled && "opacity-50",
      )}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-fit">
        <Switch
          checked={rule.enabled}
          onCheckedChange={() => toggle.mutate()}
          aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
        />
      </div>
      <span className="truncate text-[13px] font-medium text-foreground">
        {rule.name || "Untitled rule"}
      </span>
      <span className="truncate font-mono text-[11.5px] text-muted-foreground/85">
        {describeRule(rule)}
      </span>
      <span className="flex items-center gap-1.5">
        {dots.map((accountId) => {
          const index = accounts.findIndex((a) => a.accountId === accountId);
          return (
            <AccountDot
              key={accountId}
              colorIndex={index < 0 ? 0 : index}
              accountId={accountId}
            />
          );
        })}
      </span>
      <span className="flex items-center justify-end gap-1.5 text-right font-mono text-[10.5px] text-muted-foreground">
        {errored && (
          <span className="rounded bg-label-red/15 px-1.5 py-0.5 text-label-red">
            {rule.lastRunStatus}
          </span>
        )}
        {rule.lastRunAt ? formatRelative(rule.lastRunAt) : "never"}
      </span>
    </div>
  );
}

const emptyDraft = (accountIds: string[]): RuleInput => ({
  name: null,
  accountIds,
  match: "all",
  conditions: [emptyCondition()],
  actions: [{ type: "archive" }],
  applyToExisting: false,
});

function RuleModal({
  rule,
  accounts,
  onClose,
}: {
  rule: Rule | null;
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleInput>(
    rule
      ? {
          name: rule.name,
          accountIds: rule.accountIds.length
            ? rule.accountIds
            : accounts.map((a) => a.accountId),
          match: rule.match,
          conditions: rule.conditions,
          actions: rule.actions,
          applyToExisting: rule.applyToExisting,
        }
      : emptyDraft(accounts.map((a) => a.accountId)),
  );
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const set = (patch: Partial<RuleInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
  };

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      rule ? updateRule(rule.id, draft) : createRule(draft).then(() => undefined),
    onSuccess: invalidateAndClose,
  });
  const remove = useMutation({
    mutationFn: () => deleteRule(rule!.id),
    onSuccess: invalidateAndClose,
  });
  const test = useMutation({ mutationFn: () => previewRule(draft), onSuccess: setPreview });

  const valid = isRuleValid(draft) && draft.accountIds.length > 0;
  const error = save.error ?? test.error;

  const toggleAccount = (accountId: string) =>
    set({
      accountIds: draft.accountIds.includes(accountId)
        ? draft.accountIds.filter((id) => id !== accountId)
        : [...draft.accountIds, accountId],
    });

  const setCondition = (index: number, next: Condition) =>
    set({ conditions: draft.conditions.map((c, i) => (i === index ? next : c)) });
  const setAction = (index: number, next: Action) =>
    set({ actions: draft.actions.map((a, i) => (i === index ? next : a)) });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-2">
          <GitBranch className="size-[18px] text-muted-foreground" />
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>

        <Section label="Name">
          <Input
            placeholder="e.g. Archive GitHub noise"
            value={draft.name ?? ""}
            onChange={(e) => set({ name: e.target.value || null })}
          />
        </Section>

        <Section label="Conditions">
          <div className="py-1">
            <div className="flex flex-col gap-2">
              {draft.conditions.map((condition, index) => (
                <ConditionSentenceRow
                  key={index}
                  condition={condition}
                  index={index}
                  match={draft.match}
                  accounts={accounts}
                  accountIds={draft.accountIds}
                  onMatchChange={(match) => set({ match })}
                  onChange={(next) => setCondition(index, next)}
                  onRemove={
                    draft.conditions.length > 1
                      ? () =>
                          set({
                            conditions: draft.conditions.filter((_, i) => i !== index),
                          })
                      : undefined
                  }
                />
              ))}
              <AccountSentenceSelector
                accounts={accounts}
                accountIds={draft.accountIds}
                onToggle={toggleAccount}
              />
            </div>
          </div>
          <AddButton
            onClick={() =>
              set({
                conditions: [...draft.conditions, emptyCondition()],
              })
            }
          >
            add condition
          </AddButton>
        </Section>

        <Section label="Actions" hint="all actions run, in order">
          <div className="flex flex-col gap-2">
            {draft.actions.map((action, index) => (
              <ActionRow
                key={index}
                action={action}
                labelAccountId={draft.accountIds[0]}
                onChange={(next) => setAction(index, next)}
                onRemove={
                  draft.actions.length > 1
                    ? () => set({ actions: draft.actions.filter((_, i) => i !== index) })
                    : undefined
                }
              />
            ))}
          </div>
          <AddButton onClick={() => set({ actions: [...draft.actions, { type: "star" }] })}>
            add action
          </AddButton>
        </Section>

        <Section label="Existing mail" hint="last 30 days or 500 messages, whichever first">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={draft.applyToExisting}
              onChange={(e) => set({ applyToExisting: e.target.checked })}
            />
            Also apply this rule to existing messages in my inbox
          </label>
          {valid && (
            <button
              type="button"
              onClick={() => test.mutate()}
              className="mt-2 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {test.isPending ? "checking…" : "preview matches"}
            </button>
          )}
          {preview && (
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {preview.matched === 0
                ? "no recent mail matches"
                : `${preview.matched}${preview.matched >= 8 ? "+" : ""} recent message${
                    preview.matched === 1 ? "" : "s"
                  } match`}
            </p>
          )}
        </Section>

        {error && <p className="text-[12px] text-label-red">{(error as Error).message}</p>}

        <DialogFooter className="items-center sm:justify-between">
          {rule ? (
            <button
              type="button"
              onClick={() => remove.mutate()}
              className="text-[12px] text-muted-foreground transition-colors hover:text-label-red"
            >
              Delete rule
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : rule ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.5px] text-muted-foreground uppercase">
          {label}
        </span>
        {typeof hint === "string" ? (
          <span className="font-mono text-[11px] text-muted-foreground/60">{hint}</span>
        ) : (
          hint
        )}
      </div>
      {children}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-fit font-mono text-[12px] text-primary transition-opacity hover:opacity-80"
    >
      + {children}
    </button>
  );
}

function MatchConnector({
  value,
  onChange,
}: {
  value: MatchMode;
  onChange: (value: MatchMode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === "all" ? "any" : "all")}
      className="inline-flex h-5 items-center justify-center rounded-[5px] border bg-muted/35 px-1.5 font-mono text-[10px] leading-none font-semibold tracking-[0.35px] text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground"
      aria-label={`Switch match mode to ${value === "all" ? "OR" : "AND"}`}
    >
      {value === "all" ? "AND" : "OR"}
    </button>
  );
}

function ConditionSentenceRow({
  condition,
  index,
  match,
  accounts,
  accountIds,
  onMatchChange,
  onChange,
  onRemove,
}: {
  condition: Condition;
  index: number;
  match: MatchMode;
  accounts: Account[];
  accountIds: string[];
  onMatchChange: (next: MatchMode) => void;
  onChange: (next: Condition) => void;
  onRemove?: () => void;
}) {
  const isAttachment = condition.field === "hasAttachment";
  const isLabel = condition.field === "label";
  const labelAccountId = accountIds[0] ?? accounts[0]?.accountId;
  const valueWidth = `${Math.max(11, Math.min(34, condition.value.length + 2))}ch`;
  const prefix =
    index === 0 ? (
      <span className="text-foreground">
        {isAttachment ? "Match emails where the email" : "Match emails where the"}
      </span>
    ) : (
      <>
        <MatchConnector value={match} onChange={onMatchChange} />
        <span>{isAttachment ? "the email" : "the"}</span>
      </>
    );
  return (
    <div className="group flex min-h-7 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] leading-6 text-muted-foreground">
      {prefix}
      <FieldSelect
        className="h-6 rounded-none border-x-0 border-t-0 border-b border-input bg-transparent px-0 py-0 text-[12.5px] font-medium text-foreground shadow-none hover:border-primary dark:bg-transparent"
        value={condition.field}
        onValueChange={(field) => onChange(emptyCondition(field as ConditionField))}
        items={FIELD_OPTIONS}
      />
      {!isAttachment && (
        <>
          <FieldSelect
            className="h-6 rounded-none border-x-0 border-t-0 border-b border-input bg-transparent px-0 py-0 text-[12.5px] text-muted-foreground shadow-none hover:border-primary hover:text-foreground dark:bg-transparent"
            value={condition.operator}
            onValueChange={(operator) =>
              onChange({ ...condition, operator: operator as Condition["operator"] })
            }
            items={operatorOptionsFor(condition.field)}
          />
          {isLabel ? (
            <LabelPicker
              accountId={labelAccountId}
              value={condition.value}
              variant="sentence"
              onChange={(value) => onChange({ ...condition, value })}
            />
          ) : (
            <Input
              className="h-6 min-w-24 max-w-full flex-none rounded-none border-x-0 border-t-0 border-b border-input bg-transparent px-0 py-0 font-mono text-[12.5px] text-foreground hover:border-primary focus-visible:border-primary focus-visible:ring-0 dark:bg-transparent"
              style={{ width: valueWidth }}
              placeholder={condition.field === "subject" ? "[CRITICAL]" : "@github.com"}
              value={condition.value}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
            />
          )}
        </>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function AccountSentenceSelector({
  accounts,
  accountIds,
  onToggle,
}: {
  accounts: Account[];
  accountIds: string[];
  onToggle: (accountId: string) => void;
}) {
  return (
    <div className="mt-1 overflow-hidden rounded-lg border bg-card">
      <div className="flex h-7 items-center border-b px-2">
        <span className="font-mono text-[10px] tracking-[0.5px] text-muted-foreground uppercase">
          in
        </span>
      </div>
      <div className="flex flex-col gap-1 p-1">
        {accounts.map((account, index) => {
          const checked = accountIds.includes(account.accountId);
          const color = useAccountColor(index, account.accountId);
          return (
            <button
              key={account.accountId}
              type="button"
              onClick={() => onToggle(account.accountId)}
              className={cn(
                "flex w-full items-center gap-[9px] rounded-[5px] px-1 py-[5px] text-left transition-colors",
                checked ? "hover:bg-muted" : "hover:bg-muted/70",
              )}
            >
              <span
                className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px]"
                style={
                  checked
                    ? { background: color }
                    : {
                        boxShadow: `inset 0 0 0 1.5px ${color}`,
                        opacity: 0.45,
                      }
                }
              >
                {checked && <CheckIcon className="size-2.5 text-term" strokeWidth={3} />}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[12.5px]",
                  checked ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {account.email}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[10.5px]",
                  checked ? "text-muted-foreground" : "text-muted-foreground/70",
                )}
              >
                {checked ? "in" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  labelAccountId,
  onChange,
  onRemove,
}: {
  action: Action;
  labelAccountId: string | undefined;
  onChange: (next: Action) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5">
      <FieldSelect
        className="w-44"
        value={action.type}
        onValueChange={(type) => onChange({ type: type as ActionType, value: undefined })}
        items={ACTION_OPTIONS}
      />
      {action.type === "label" ? (
        <LabelPicker
          accountId={labelAccountId}
          value={action.value ?? ""}
          variant="boxed"
          onChange={(value) => onChange({ ...action, value })}
        />
      ) : action.type === "forward" ? (
        <Input
          className="h-8 min-w-0 flex-1"
          type="email"
          placeholder="me@work.com"
          value={action.value ?? ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
        />
      ) : action.type === "webhook" ? (
        <Input
          className="h-8 min-w-0 flex-1"
          placeholder="https://hooks.example.com/…"
          value={action.value ?? ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
        />
      ) : (
        <span className="flex-1 font-mono text-[12px] text-muted-foreground/70">
          {ACTION_HINT[action.type]}
        </span>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function LabelPicker({
  accountId,
  value,
  variant = "boxed",
  onChange,
}: {
  accountId: string | undefined;
  value: string;
  variant?: "boxed" | "sentence";
  onChange: (value: string) => void;
}) {
  const labels = useLabelsQuery(accountId ?? "").data ?? [];
  const inputClass =
    variant === "sentence"
      ? "h-6 min-w-28 max-w-full flex-none rounded-none border-x-0 border-t-0 border-b border-input bg-transparent px-0 py-0 font-mono text-[12.5px] text-foreground focus-visible:border-primary focus-visible:ring-0 dark:bg-transparent"
      : "h-8 min-w-0 flex-1";
  if (labels.length === 0) {
    return (
      <Input
        className={inputClass}
        style={
          variant === "sentence"
            ? { width: `${Math.max(11, Math.min(28, value.length + 2))}ch` }
            : undefined
        }
        placeholder="label name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <FieldSelect
      className={
        variant === "sentence"
          ? "h-6 min-w-28 rounded-none border-x-0 border-t-0 border-b border-input bg-transparent px-0 py-0 font-mono text-[12.5px] text-foreground dark:bg-transparent"
          : "min-w-0 flex-1"
      }
      value={value}
      onValueChange={onChange}
      items={labels.map((label) => ({ value: label.name, label: label.name }))}
    />
  );
}

function RemoveButton({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-[color,opacity,background] hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
    >
      <XIcon className="size-3.5" />
    </button>
  );
}

function FieldSelect({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: Option[];
  className?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onValueChange(String(v))}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
