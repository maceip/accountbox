import { useId, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * Workbench display mode — the AC6-style "toggle display" for the loadout.
 * BASIC shows the operator view; FULL SPEC reveals the machine detail
 * (manifest ids, tool whitelists, adapter provenance) that is otherwise
 * kept behind developer surfaces. One global mode, persisted per browser
 * (same pattern as bm.tiles-layout / bm.account-scope).
 */
export type DisplayMode = "basic" | "full";

const STORAGE_KEY = "bm.wb-display";

function load(): DisplayMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "full" ? "full" : "basic";
  } catch {
    return "basic";
  }
}

let current: DisplayMode | null = null;
const listeners = new Set<() => void>();

function snapshot(): DisplayMode {
  if (current === null) current = load();
  return current;
}

export function setDisplayMode(mode: DisplayMode) {
  current = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
  listeners.forEach((fn) => {
    fn();
  });
}

export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot,
    () => "basic",
  );
}

const MODES: { id: DisplayMode; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "full", label: "Full spec" },
];

/**
 * Two-position mechanical switch. A carriage slides under the active label;
 * the FULL SPEC position lights a teal LED (teal = machine/runtime signal).
 * Flat surfaces and hairlines only — the motion carries the tactility, not
 * glow or gradients.
 */
export function DisplayModeToggle({ className }: { className?: string }) {
  const mode = useDisplayMode();
  const groupId = useId();
  const activeIndex = mode === "full" ? 1 : 0;

  return (
    <div
      role="radiogroup"
      aria-label="Loadout display mode"
      className={cn(
        "relative inline-flex select-none items-stretch rounded-md border border-hairline bg-surface-2/60 p-0.5",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setDisplayMode("basic");
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setDisplayMode("full");
        }
      }}
    >
      {/* Sliding carriage — the mechanical part. Width = half minus padding. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] border border-hairline-strong bg-surface-3 transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map(({ id, label }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            id={`${groupId}-${id}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setDisplayMode(id)}
            className={cn(
              "relative z-10 flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-[5px] px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors duration-150",
              "active:translate-y-px",
              active
                ? "text-ink"
                : "cursor-pointer text-ink-subtle hover:text-ink-muted",
            )}
          >
            {id === "full" && (
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full transition-colors duration-200",
                  active ? "bg-accent-2" : "bg-ink-tertiary/40",
                )}
              />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
