import type { ReactNode } from "react";

import { Frame, FramePanel } from "@/components/reui/frame";
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
      <Frame
        spacing="sm"
        className={cn("h-full border-l border-border", className)}
        data-inspector
      >
        <FramePanel className="flex h-full flex-col p-4">
          {empty ?? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Select an object to inspect
            </p>
          )}
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame
      spacing="sm"
      className={cn("h-full min-w-0 border-l border-border", className)}
      data-inspector
    >
      <FramePanel className="flex h-full min-w-0 flex-col overflow-hidden p-0">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[13px] font-semibold">{title}</h2>
          {state && <StatusChip kind={stateKind}>{state}</StatusChip>}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {sections?.map((section) => (
          <div key={section.title}>
            <p className="mb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {section.title}
            </p>
            <div className="text-[12px] text-muted-foreground">{section.content}</div>
          </div>
        ))}
      </div>
      {actions && (
        <div className="shrink-0 border-t border-border p-3">{actions}</div>
      )}
      </FramePanel>
    </Frame>
  );
}
