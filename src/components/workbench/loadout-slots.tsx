import { cn } from "@/lib/utils";

import { DisplayModeToggle, useDisplayMode } from "./display-mode";
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
  /** Machine detail revealed in FULL SPEC mode — real manifest/runtime values
   *  only (ids, whitelists, provenance). Never invented numbers. */
  spec?: string[];
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

/** Horizontal loadout strip — uniform hairline cards, status via dot only (no left stripe).
 *  The section header carries the BASIC / FULL SPEC display switch; full spec
 *  expands each card with its machine detail lines. */
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
  const displayMode = useDisplayMode();
  const fullSpec = displayMode === "full";
  const anySpec = slots.some((slot) => slot.spec?.length);

  return (
    <WbSection
      label={sectionLabel}
      className={className}
      headerRight={anySpec ? <DisplayModeToggle /> : undefined}
    >
      <div className="no-scrollbar -mx-0.5 overflow-x-auto pb-0.5">
        <div className="flex min-w-max gap-2" data-loadout-slots>
          {slots.map((slot) => {
            const selected = selectedId === slot.id;
            const spec = fullSpec ? (slot.spec ?? []) : [];
            const card = (
              <div
                className={cn(
                  "relative flex w-[7.25rem] shrink-0 flex-col rounded-md border border-hairline bg-surface-2/40 p-2 transition-colors",
                  spec.length > 0 ? "h-full min-h-28 w-[10.5rem]" : "h-20 justify-between",
                  selected && "ring-1 ring-primary/40",
                  onSelect && "hover:border-hairline-strong hover:bg-surface-2/70",
                )}
              >
                <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                  {slot.label}
                </span>
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-1",
                    spec.length > 0 && "mt-1.5",
                  )}
                >
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
                {spec.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5 border-t border-hairline pt-1.5 starting:translate-y-0.5 starting:opacity-0 transition-[opacity,translate] duration-200">
                    {spec.map((line) => (
                      <li
                        key={line}
                        className="truncate font-mono text-[10px] leading-[1.5] text-ink-subtle"
                        title={line}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
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
