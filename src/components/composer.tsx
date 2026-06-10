import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, SendIcon, XIcon } from "lucide-react";

import { useSession } from "@/lib/auth-client";
import type { Account } from "@/lib/account";
import { sendNewEmail } from "@/lib/mail-queries";
import { isTestAccount } from "@/lib/test-account";
import { AccountDot } from "@/components/account-dot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FIELD_INPUT =
  "h-10 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";

/**
 * Docked composer (design: a fixed bottom-right panel, not a Dialog).
 * From is account-aware; To is mono, Subject is Roboto (font spec); ⌘↵ sends.
 */
export function Composer({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const { data: session } = useSession();
  const sendable = useMemo(
    () => accounts.filter((a) => !isTestAccount(a.accountId) && a.email),
    [accounts],
  );

  const [fromId, setFromId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Default From: the primary (signed-in) address, else the first account. */
  const from =
    sendable.find((a) => a.accountId === fromId) ??
    sendable.find((a) => a.email === session?.user.email) ??
    sendable[0] ??
    null;

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  if (!open) return null;

  const canSend = !sending && from !== null && to.trim().length > 0;

  const send = async () => {
    if (!canSend || !from) return;
    setSending(true);
    setError(null);
    try {
      await sendNewEmail({
        accountId: from.accountId,
        to: to.trim(),
        subject,
        body,
      });
      setTo("");
      setSubject("");
      setBody("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-label="New message"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void send();
        }
        if (event.key === "Escape" && !sending) onOpenChange(false);
      }}
      className="fixed right-5 bottom-5 z-40 flex w-[520px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-input bg-secondary shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b bg-popover px-3.5 py-2.5">
        <span className="text-[13px] font-medium">New message</span>
        <button
          type="button"
          title="Close composer"
          onClick={() => onOpenChange(false)}
          className="ml-auto inline-flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </header>

      <div className="flex h-10 items-center gap-2 border-b px-4">
        <span className="w-12 shrink-0 text-xs text-muted-foreground">
          From
        </span>
        {from ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
              <AccountDot
                colorIndex={accounts.findIndex(
                  (a) => a.accountId === from.accountId,
                )}
                accountId={from.accountId}
              />
              <span className="truncate font-mono text-[12.5px]">
                {from.email}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {sendable.map((account) => (
                <DropdownMenuItem
                  key={account.accountId}
                  onClick={() => setFromId(account.accountId)}
                >
                  <AccountDot
                    colorIndex={accounts.findIndex(
                      (a) => a.accountId === account.accountId,
                    )}
                    accountId={account.accountId}
                  />
                  <span className="font-mono">{account.email}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-xs text-muted-foreground">
            No sendable account linked
          </span>
        )}
      </div>

      <div className="flex h-10 items-center gap-2 border-b px-4">
        <span className="w-12 shrink-0 text-xs text-muted-foreground">To</span>
        <Input
          autoFocus
          type="email"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="someone@example.com"
          className={`${FIELD_INPUT} font-mono text-[12.5px]`}
        />
      </div>

      <div className="flex h-10 items-center gap-2 border-b px-4">
        <span className="w-12 shrink-0 text-xs text-muted-foreground">
          Subject
        </span>
        <Input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject"
          className={`${FIELD_INPUT} text-[13px]`}
        />
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write your message…"
        className="min-h-[220px] resize-none rounded-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0"
      />

      <footer className="flex items-center gap-3 border-t px-3.5 py-2.5">
        <Button size="sm" disabled={!canSend} onClick={() => void send()}>
          <SendIcon data-icon="inline-start" />
          {sending ? "Sending…" : "Send"}
        </Button>
        {error && (
          <span className="min-w-0 truncate font-mono text-[11px] text-label-red">
            {error}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
          ⌘↵ send
        </span>
      </footer>
    </section>
  );
}
