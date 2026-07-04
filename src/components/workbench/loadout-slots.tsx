import { cn } from "@/lib/utils";
import { StatusChip, type StatusKind } from "./status-chip";

export type LoadoutSlotState =
  | "empty"
  | "available"
  | "loading"
  | "equipped"
  | "failing"
  | "blocked"
  | "passing";

export type LoadoutSlot = {
  id: string;
  label: string;
  detail?: string;
  state: LoadoutSlotState;
};

const STATE_KIND: Record<LoadoutSlotState, StatusKind> = {
  empty: "info",
  available: "info",
  loading: "warning",
  equipped: "ready",
  failing: "blocked",
  blocked: "blocked",
  passing: "ready",
};

/** Base → Adapter → Policy → Source → Eval → Runtime strip. */
export function LoadoutSlots({
  slots,
  className,
  onSelect,
  selectedId,
}: {
  slots: LoadoutSlot[];
  className?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-stretch gap-1.5",
        className,
      )}
      data-loadout-slots
    >
      {slots.map((slot, index) => {
        const selected = selectedId === slot.id;
        return (
          <div key={slot.id} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <span className="font-mono text-[10px] text-ink-tertiary">→</span>
            )}
            <button
              type="button"
              onClick={() => onSelect?.(slot.id)}
              disabled={!onSelect}
              className={cn(
                "flex min-w-[88px] flex-col gap-1 rounded-md border px-2 py-1.5 text-left transition-colors",
                selected
                  ? "border-command bg-command/10"
                  : "border-hairline bg-surface-1 hover:bg-surface-2",
                !onSelect && "cursor-default",
              )}
            >
              <span className="font-mono text-[9px] tracking-wide text-ink-muted uppercase">
                {slot.label}
              </span>
              <span className="truncate text-[12px] font-medium text-ink">
                {slot.detail ?? slot.state}
              </span>
              <StatusChip kind={STATE_KIND[slot.state]}>{slot.state}</StatusChip>
            </button>
          </div>
        );
      })}
    </div>
  );
}
