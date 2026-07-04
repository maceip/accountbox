import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusKind =
  | "ready"
  | "warning"
  | "blocked"
  | "runtime"
  | "info"
  | "command";

const KIND_CLASS: Record<StatusKind, string> = {
  ready: "status-chip-ready",
  warning: "status-chip-warning",
  blocked: "status-chip-blocked",
  runtime: "status-chip-runtime",
  info: "status-chip-info",
  command: "border-command/30 bg-command/10 text-command",
};

export function StatusChip({
  kind,
  children,
  className,
}: {
  kind: StatusKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(KIND_CLASS[kind], className)}>
      {children}
    </span>
  );
}
