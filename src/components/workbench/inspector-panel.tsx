import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusChip, type StatusKind } from "./status-chip";

export type InspectorSection = {
  title: string;
  content: ReactNode;
};

/** Right-rail inspector — state, provenance, inputs, outputs, risk, actions. */
export function InspectorPanel({
  title,
  state,
  stateKind = "info",
  sections,
  actions,
  className,
  empty,
}: {
  title?: string;
  state?: string;
  stateKind?: StatusKind;
  sections?: InspectorSection[];
  actions?: ReactNode;
  className?: string;
  empty?: ReactNode;
}) {
  if (!title && !sections?.length) {
    return (
      <aside
        className={cn(
          "flex h-full flex-col border-l border-hairline bg-surface-1 p-4",
          className,
        )}
        data-inspector
      >
        {empty ?? (
          <p className="font-mono text-[11px] text-ink-subtle">
            Select an object to inspect
          </p>
        )}
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-full min-w-0 flex-col border-l border-hairline bg-surface-1",
        className,
      )}
      data-inspector
    >
      <div className="shrink-0 border-b border-hairline px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[13px] font-semibold">{title}</h2>
          {state && <StatusChip kind={stateKind}>{state}</StatusChip>}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {sections?.map((section) => (
          <div key={section.title}>
            <p className="mb-1 font-mono text-[10px] tracking-wide text-ink-muted uppercase">
              {section.title}
            </p>
            <div className="text-[12px] text-ink-muted">{section.content}</div>
          </div>
        ))}
      </div>
      {actions && (
        <div className="shrink-0 border-t border-hairline p-3">{actions}</div>
      )}
    </aside>
  );
}
