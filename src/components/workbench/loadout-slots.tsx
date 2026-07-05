import { cn } from "@/lib/utils";

import { WbSection } from "./workbench-surfaces";

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

const STATE_DOT: Record<LoadoutSlotState, string> = {
  empty: "bg-ink-tertiary/50",
  available: "bg-ink-tertiary/50",
  loading: "bg-primary animate-pulse",
  equipped: "bg-accent-2",
  failing: "bg-label-red",
  blocked: "bg-label-red",
  passing: "bg-accent-2",
};

const STATE_LABEL: Record<LoadoutSlotState, string> = {
  empty: "text-ink-subtle",
  available: "text-ink-subtle",
  loading: "text-primary",
  equipped: "text-ink",
  failing: "text-label-red",
  blocked: "text-label-red",
  passing: "text-accent-2",
};

/** Horizontal loadout strip — uniform hairline cards, status via dot only (no left stripe). */
export function LoadoutSlots({
  slots,
  className,
  onSelect,
  selectedId,
  sectionLabel = "active loadout",
}: {
  slots: LoadoutSlot[];
  className?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  sectionLabel?: string;
}) {
  return (
    <WbSection label={sectionLabel} className={className}>
      <div className="no-scrollbar -mx-0.5 overflow-x-auto pb-0.5">
        <div className="flex min-w-max gap-2" data-loadout-slots>
          {slots.map((slot) => {
            const selected = selectedId === slot.id;
            const card = (
              <div
                className={cn(
                  "relative flex h-20 w-[7.25rem] shrink-0 flex-col justify-between rounded-md border border-hairline bg-surface-2/40 p-2 transition-colors",
                  selected && "ring-1 ring-primary/40",
                  onSelect && "hover:border-hairline-strong hover:bg-surface-2/70",
                )}
              >
                <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                  {slot.label}
                </span>
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      STATE_DOT[slot.state],
                    )}
                  />
                  <span
                    className={cn(
                      "truncate font-mono text-[11px]",
                      STATE_LABEL[slot.state],
                    )}
                  >
                    {slot.detail ?? slot.state}
                  </span>
                </div>
              </div>
            );

            if (onSelect) {
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelect(slot.id)}
                  className="text-left"
                >
                  {card}
                </button>
              );
            }
            return <div key={slot.id}>{card}</div>;
          })}
        </div>
      </div>
    </WbSection>
  );
}
