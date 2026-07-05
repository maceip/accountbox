import {
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { WbSection } from "./workbench-surfaces";

export type ReadinessItem = {
  id: string;
  label: string;
  ready: boolean;
  detail?: string;
  /** Override pill tone when not ready (default: pending). */
  tone?: "pending" | "blocked";
};

function ReadinessPill({ item }: { item: ReadinessItem }) {
  if (item.ready) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-accent-2/30 bg-accent-2/10 px-2 py-0.5 font-mono text-[10px] uppercase text-accent-2">
        <CheckCircle2 className="size-3" />
        Valid
      </span>
    );
  }
  if (item.tone === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-label-red/30 bg-label-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-label-red">
        <AlertTriangle className="size-3" />
        Error
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] uppercase"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--color-blocker-bg) 80%, transparent)",
        borderColor:
          "color-mix(in srgb, var(--color-blocker-border) 50%, transparent)",
        color: "var(--color-blocker-ink)",
      }}
    >
      <Clock className="size-3" />
      Pending
    </span>
  );
}

/** Readiness diagnostics — flat rows, status pill on the right. No left accent stripes. */
export function ReadinessBar({
  items,
  className,
}: {
  items: ReadinessItem[];
  className?: string;
}) {
  const readyCount = items.filter((i) => i.ready).length;
  return (
    <WbSection
      label="readiness diagnostics"
      className={className}
      headerRight={
        <span className="font-mono text-[10px] text-muted-foreground">
          {readyCount}/{items.length}
        </span>
      }
    >
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" data-readiness-bar>
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded border border-hairline bg-surface-2/30 px-3 py-2",
              !item.ready && item.tone === "blocked" && "border-label-red/20",
            )}
          >
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-ink">{item.label}</p>
              {item.detail && (
                <p className="mt-0.5 truncate font-mono text-[10px] text-ink-subtle">
                  {item.detail}
                </p>
              )}
            </div>
            <ReadinessPill item={item} />
          </li>
        ))}
      </ul>
    </WbSection>
  );
}
