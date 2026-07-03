import { RefreshCwIcon } from "lucide-react";

import type {
  IncomingItem,
  IncomingItemAction,
  ItemTone,
} from "@/lib/sources/feed";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuGroup,
} from "@/components/ui/context-menu";

/**
 * The generic incoming-items surface: any source's items, one row language
 * (the mail row's — from / title+preview / status / time), actions as
 * descriptors rendered in a context menu. GitHub's PR and issue panels render
 * through this; it's the surface future sources land on.
 */

const TONE_TEXT: Record<ItemTone, string> = {
  neutral: "text-muted-foreground/70",
  positive: "text-label-green",
  negative: "text-label-red",
  attention: "text-primary",
};

function shortTime(raw: string, now: number): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((now - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  if (minutes < 43200) return `${Math.round(minutes / 1440)}d`;
  return date.toLocaleDateString([], { month: "short", year: "2-digit" });
}

export function FeedRow({
  item,
  now,
  actions = [],
  onOpen,
  portalContainer,
}: {
  item: IncomingItem;
  /** Baseline for relative times (one Date.now() per list render). */
  now: number;
  actions?: IncomingItemAction[];
  /** Row click. External items (item.url) can open the link here. */
  onOpen?: () => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const unread = item.unread ?? false;

  const row = (
    <button
      type="button"
      onClick={onOpen}
      data-feed-item={`${item.source}:${item.id}`}
      className="w-full min-w-0 cursor-pointer overflow-hidden border-b border-border px-3.5 py-2 text-left hover:bg-muted"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            unread ? "bg-primary" : "bg-transparent",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "min-w-0 truncate font-mono text-[11px]",
            unread ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {item.from}
        </span>
        <span className="flex-1" />
        {item.status && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px]",
              TONE_TEXT[item.status.tone],
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {item.status.label}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground/60">
          {shortTime(item.date, now)}
        </span>
      </div>
      <p
        className={cn(
          "mt-0.5 line-clamp-1 pl-3.5 text-[12.5px] leading-[1.35]",
          unread ? "font-semibold text-foreground" : "text-foreground/85",
        )}
      >
        {item.title}
      </p>
      {(item.preview || (item.tags?.length ?? 0) > 0) && (
        <div className="mt-0.5 flex min-w-0 items-center gap-2 pl-3.5">
          {item.preview && (
            <span className="min-w-0 truncate font-mono text-[10.5px] text-muted-foreground/70">
              {item.preview}
            </span>
          )}
          {item.tags && item.tags.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {item.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/70 px-1.5 font-mono text-[9.5px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </button>
  );

  if (actions.length === 0) return row;

  const safe = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent container={portalContainer}>
        <ContextMenuGroup>
          {safe.map((action) => (
            <ContextMenuItem key={action.id} onClick={() => void action.run()}>
              {action.label}
            </ContextMenuItem>
          ))}
          {destructive.map((action) => (
            <ContextMenuItem
              key={action.id}
              variant="destructive"
              onClick={() => void action.run()}
            >
              {action.label}
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FeedList({
  items,
  now,
  emptyLabel,
  actionsFor,
  onOpen,
  footer,
  portalContainer,
}: {
  items: IncomingItem[];
  now: number;
  emptyLabel: string;
  /** Per-item action descriptors (the source's row verbs). */
  actionsFor?: (item: IncomingItem) => IncomingItemAction[];
  onOpen?: (item: IncomingItem) => void;
  footer?: React.ReactNode;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center px-6 py-10">
        <p className="font-mono text-[11px] text-muted-foreground/70">
          {emptyLabel}
        </p>
      </div>
    );
  }
  return (
    <>
      {items.map((item) => (
        <FeedRow
          key={item.id}
          item={item}
          now={now}
          actions={actionsFor?.(item) ?? []}
          onOpen={onOpen ? () => onOpen(item) : undefined}
          portalContainer={portalContainer}
        />
      ))}
      {footer}
    </>
  );
}

/** Shared loading footer for infinite feeds. */
export function FeedLoadingMore() {
  return (
    <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/70">
      <RefreshCwIcon className="size-3 shrink-0 animate-spin" />
      Loading more…
    </div>
  );
}
