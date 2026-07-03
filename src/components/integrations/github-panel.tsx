import { GithubMark } from "@/components/integrations/github-mark";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

// Shared chrome for the GitHub board panels: inline stat segments, mono filter
// select, and the connect/error/skeleton states. Rows themselves render on the
// generic workbench feed surface (components/workbench/feed-list).

/** Inline "N label" stat segments with vertical dividers. `you` segments
 *  (attention counts — awaiting review / assigned) render in the accent. */
export function StatStrip({
  segs,
}: {
  segs: { value: number; label: string; you?: boolean }[];
}) {
  return (
    <div className="no-scrollbar flex flex-none items-center overflow-x-auto border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
      {segs.map((s, i) => (
        <span
          key={s.label}
          className={cn(
            "inline-flex shrink-0 items-baseline gap-[5px] border-r border-border px-[11px] last:border-r-0",
            i === 0 && "pl-0",
            s.you && "text-primary",
          )}
        >
          <span
            className={cn(
              "text-[12.5px] font-semibold",
              s.you ? "text-primary" : "text-foreground",
            )}
          >
            {formatCount(s.value)}
          </span>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Filter as a compact shadcn Select (id equals label, so the trigger shows it
 *  directly), with the result count on the right. */
export function FilterSelect<T extends string>({
  items,
  value,
  onChange,
  shown,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  shown: number;
}) {
  return (
    <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2">
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger
          size="sm"
          className="h-7 w-auto gap-1.5 font-mono text-[11px] capitalize"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem
              key={it.id}
              value={it.id}
              className="font-mono text-[12px] capitalize"
            >
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-auto font-mono text-[10.5px] whitespace-nowrap text-muted-foreground/60">
        {shown} shown
      </span>
    </div>
  );
}

/** Mono "live from the GitHub API" footer. */
export function GithubFooter() {
  return (
    <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/60">
      <GithubMark className="size-3" />
      live from the GitHub API
    </div>
  );
}

export function ConnectState({
  blurb,
  onConnect,
}: {
  blurb: string;
  onConnect: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-muted">
          <GithubMark className="size-6 text-foreground" />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.3px]">
          Connect GitHub
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {blurb}
        </p>
        <Button onClick={onConnect} className="mt-1">
          <GithubMark className="size-4" />
          Connect GitHub
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          read-only
        </span>
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="font-mono text-[11.5px] wrap-break-word text-muted-foreground/80">
          {message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-none items-center gap-3 border-b border-border px-3 py-2.5">
        {[14, 20].map((w) => (
          <span
            key={w}
            className="h-3 animate-pulse rounded bg-muted/60"
            style={{ width: w * 4 }}
          />
        ))}
      </div>
      <div className="flex-1 space-y-px p-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders.
            key={i}
            className="flex items-center gap-2 px-3 py-2.5"
          >
            <span className="size-2 animate-pulse rounded-full bg-muted" />
            <span className="h-3 w-24 animate-pulse rounded bg-muted" />
            <span className="h-3 flex-1 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
