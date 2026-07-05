import {
  Frame,
  FramePanel,
  FrameTitle,
  FrameDescription,
} from "@/components/reui/frame";
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

/** Base → Adapter → Policy → Source → Eval → Runtime strip (ReUI Frame). */
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
    <Frame
      variant="ghost"
      spacing="xs"
      className={cn("flex-row flex-wrap items-stretch", className)}
      data-loadout-slots
    >
      {slots.map((slot, index) => {
        const selected = selectedId === slot.id;
        const inner = (
          <FramePanel
            fit
            className={cn(
              "min-w-[88px] transition-colors",
              selected && "ring-1 ring-primary/40",
              onSelect && "hover:bg-muted/50",
            )}
          >
            <FrameTitle className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
              {slot.label}
            </FrameTitle>
            <FrameDescription className="truncate text-[12px] font-medium text-foreground">
              {slot.detail ?? slot.state}
            </FrameDescription>
            <StatusChip kind={STATE_KIND[slot.state]} className="mt-1">
              {slot.state}
            </StatusChip>
          </FramePanel>
        );

        return (
          <div key={slot.id} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <span
                aria-hidden
                className="font-mono text-[10px] text-muted-foreground"
              >
                →
              </span>
            )}
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(slot.id)}
                className="text-left"
              >
                {inner}
              </button>
            ) : (
              inner
            )}
          </div>
        );
      })}
    </Frame>
  );
}
