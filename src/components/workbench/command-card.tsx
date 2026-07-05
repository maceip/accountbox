import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StatusChip, type StatusKind } from "./status-chip";

export type CommandAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  hotkey?: string;
  disabled?: boolean;
  disabledReason?: string;
  status?: StatusKind;
  onPress: () => void;
};

/** Compact RTS-style command card — tactical action grid. */
export function CommandCard({
  actions,
  className,
  label = "commands",
}: {
  actions: CommandAction[];
  className?: string;
  label?: string;
}) {
  return (
    <section className={cn("wb-panel space-y-2", className)} data-command-card>
      <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        <span className="text-ink-tertiary">{"// "}</span>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon;
            const button = (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                disabled={action.disabled}
                onClick={action.onPress}
                className="h-auto min-h-14 flex-col gap-1 px-2 py-2"
              >
                <Icon className="size-4 shrink-0" />
                <span className="text-[11px] font-medium leading-tight">
                  {action.label}
                </span>
                {action.hotkey && (
                  <Kbd className="font-mono text-[9px]">{action.hotkey}</Kbd>
                )}
                {action.status && (
                  <StatusChip kind={action.status} className="mt-0.5">
                    {action.status}
                  </StatusChip>
                )}
              </Button>
            );
            if (action.disabled && action.disabledReason) {
              return (
                <Hint key={action.id} label={action.disabledReason}>
                  {button}
                </Hint>
              );
            }
            return button;
          })}
      </div>
    </section>
  );
}
