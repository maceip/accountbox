import { AccountDot } from "@/components/account-dot";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

export type ThreadRowEmail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet?: string;
  unread?: boolean;
};

export type Density = "comfortable" | "compact";

/** "Jane Doe <jane@x.com>" → "Jane Doe"; bare addresses pass through. */
function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*)"?\s*</);
  const name = match?.[1]?.trim();
  return name || from.replace(/[<>]/g, "").trim();
}

/** Short mono time column: today → 14:05, this year → Jun 5, else Dec 2024. */
function shortTime(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { month: "short", year: "2-digit" });
}

export function ThreadRow({
  email,
  density = "comfortable",
  selected = false,
  dotIndex,
  accountId,
  onClick,
}: {
  email: ThreadRowEmail;
  density?: Density;
  selected?: boolean;
  dotIndex: number;
  accountId?: string;
  onClick?: () => void;
}) {
  const { snippetFont, showSnippets } = useSettings();
  const unread = email.unread ?? false;
  const subject = email.subject || "(no subject)";
  const rowClass = cn(
    "w-full min-w-0 cursor-pointer overflow-hidden border-b border-border border-l-2 border-l-transparent text-left hover:bg-muted",
    selected && "border-l-primary bg-accent",
  );
  const sender = (
    <span
      className={cn(
        "truncate",
        unread ? "font-semibold text-foreground" : "font-normal text-foreground/70",
      )}
    >
      {senderName(email.from)}
    </span>
  );
  const time = (
    <span
      className={cn(
        "shrink-0 font-mono text-[10.5px]",
        unread ? "text-muted-foreground" : "text-muted-foreground/70",
      )}
    >
      {shortTime(email.date)}
    </span>
  );
  const subjectSnippet = (
    // color here is what the truncation ellipsis renders in
    <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground/70">
      <span className={cn(unread ? "font-medium text-foreground" : "text-muted-foreground")}>
        {subject}
      </span>
      {showSnippets && email.snippet && (
        <span
          className={cn(
            "text-muted-foreground/70",
            snippetFont === "mono" && "font-mono text-[11px]",
          )}
        >
          {"  —  " + email.snippet}
        </span>
      )}
    </span>
  );

  if (density === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(rowClass, "flex h-[34px] items-center gap-[9px] px-3.5")}
      >
        <AccountDot colorIndex={dotIndex} accountId={accountId} unread={unread} />
        <span className="flex w-28 shrink-0 text-[12.5px]">{sender}</span>
        {subjectSnippet}
        <span className="w-[42px] text-right">{time}</span>
      </button>
    );
  }

  // Comfortable — exactly two lines: sender + time, then subject — snippet.
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(rowClass, "flex gap-2.5 px-3.5 py-[7px]")}
    >
      <span className="pt-[5px]">
        <AccountDot colorIndex={dotIndex} accountId={accountId} unread={unread} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate text-left">{sender}</span>
          {time}
        </span>
        {subjectSnippet}
      </span>
    </button>
  );
}
