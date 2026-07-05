import type { ReactNode } from "react";

import { Badge, type BadgeProps } from "@/components/reui/badge";
import { cn } from "@/lib/utils";

export type StatusKind =
  | "ready"
  | "warning"
  | "blocked"
  | "runtime"
  | "info"
  | "command";

const KIND_VARIANT: Record<StatusKind, NonNullable<BadgeProps["variant"]>> = {
  ready: "success-light",
  warning: "warning-light",
  blocked: "destructive-light",
  runtime: "info-light",
  info: "secondary",
  command: "primary-light",
};

/** Status affordance — ReUI Badge with workbench kind mapping. */
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
    <Badge
      variant={KIND_VARIANT[kind]}
      size="sm"
      className={cn("font-mono uppercase tracking-wide", className)}
    >
      {children}
    </Badge>
  );
}
