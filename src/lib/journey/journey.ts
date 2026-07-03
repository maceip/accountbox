/**
 * Journey state machine — the shell is earned, not given.
 *
 * A fresh vault does NOT open into the mail board. The user walks three steps,
 * each of which does the real thing (no simulated progress):
 *
 *   1. chat-agent       — stream the chat model, have one real exchange
 *   2. first-skill      — stream the skill model + LoRA, get one real plan
 *   3. connect-account  — link the account that powers execution
 *
 * Only when all three are done does the full shell (sidebar, board, settings)
 * render. Existing users are grandfathered: linked accounts on boot mark the
 * journey complete, so nobody who already uses the app ever sees the gate.
 *
 * Pure derivation lives in deriveStepStates/isJourneyComplete (unit-tested);
 * the tiny subscribable store follows the agent-preload.ts pattern. State is
 * persisted in localStorage and carried by the vault export (portability.ts).
 */

export const JOURNEY_STORAGE_KEY = "accountbox:journey";

export const JOURNEY_STEPS = [
  "chat-agent",
  "first-skill",
  "connect-account",
] as const;
export type JourneyStepId = (typeof JOURNEY_STEPS)[number];

export type StepState = "locked" | "active" | "done";

export type JourneyCompletedVia =
  | "steps"
  | "grandfathered"
  | "unsupported-device";

export type JourneySnapshot = {
  steps: Record<JourneyStepId, StepState>;
  /** True when every step is done — the full shell may render. */
  complete: boolean;
  /** True once ANY step is done (used to distinguish a mid-journey user from
   *  a pre-journey user during grandfathering). */
  progressed: boolean;
  /** How completion happened; "grandfathered" means the gate was never shown,
   *  "unsupported-device" means the agent can't run here and the user chose
   *  to continue to mail without it. */
  completedVia?: JourneyCompletedVia;
};

type StoredJourney = {
  v: 1;
  done: JourneyStepId[];
  completedVia?: JourneyCompletedVia;
};

// ── Pure logic (unit-tested, no browser dependencies) ────────────────────────

/** Steps complete strictly in order: done steps stay done, the first not-done
 *  step is active, everything after it is locked. */
export function deriveStepStates(
  done: readonly JourneyStepId[],
): Record<JourneyStepId, StepState> {
  const doneSet = new Set(done);
  const states = {} as Record<JourneyStepId, StepState>;
  let activeAssigned = false;
  for (const id of JOURNEY_STEPS) {
    if (doneSet.has(id)) {
      states[id] = "done";
    } else if (!activeAssigned) {
      states[id] = "active";
      activeAssigned = true;
    } else {
      states[id] = "locked";
    }
  }
  return states;
}

export function isJourneyComplete(done: readonly JourneyStepId[]): boolean {
  const doneSet = new Set(done);
  return JOURNEY_STEPS.every((id) => doneSet.has(id));
}

/** Completing a step only takes effect for the ACTIVE step (idempotent for
 *  done, refused for locked — a locked step's UI is never reachable, so a
 *  completion signal for it is a bug we refuse to amplify). */
export function applyStepDone(
  done: readonly JourneyStepId[],
  step: JourneyStepId,
): JourneyStepId[] {
  const states = deriveStepStates(done);
  if (states[step] !== "active") return [...done];
  return [...done, step];
}

/** Fail-safe parse: anything unexpected (corrupt JSON, unknown version,
 *  unknown step ids) resets to a fresh journey rather than crashing boot. */
export function parseStoredJourney(text: string | null): StoredJourney {
  const fresh: StoredJourney = { v: 1, done: [] };
  if (!text) return fresh;
  try {
    const x = JSON.parse(text);
    if (x?.v !== 1 || !Array.isArray(x.done)) return fresh;
    const done = x.done.filter((id: unknown): id is JourneyStepId =>
      (JOURNEY_STEPS as readonly string[]).includes(id as string),
    );
    const completedVia =
      x.completedVia === "steps" ||
      x.completedVia === "grandfathered" ||
      x.completedVia === "unsupported-device"
        ? x.completedVia
        : undefined;
    return { v: 1, done, completedVia };
  } catch {
    return fresh;
  }
}

// ── Store (subscribable, localStorage-persisted) ─────────────────────────────

let stored: StoredJourney | null = null;
const listeners = new Set<() => void>();

function readStorage(): StoredJourney {
  if (typeof localStorage === "undefined") return { v: 1, done: [] };
  try {
    return parseStoredJourney(localStorage.getItem(JOURNEY_STORAGE_KEY));
  } catch {
    return { v: 1, done: [] };
  }
}

function writeStorage(next: StoredJourney) {
  try {
    localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — journey still works for this session
  }
}

function current(): StoredJourney {
  if (!stored) stored = readStorage();
  return stored;
}

function setStored(next: StoredJourney) {
  stored = next;
  writeStorage(next);
  for (const fn of listeners) fn();
}

let cachedSnapshot: JourneySnapshot | null = null;
let cachedFor: StoredJourney | null = null;

/** Snapshot is cached per store state so useSyncExternalStore doesn't tear. */
export function getJourney(): JourneySnapshot {
  const s = current();
  if (cachedSnapshot && cachedFor === s) return cachedSnapshot;
  cachedFor = s;
  cachedSnapshot = {
    steps: deriveStepStates(s.done),
    complete: isJourneyComplete(s.done),
    progressed: s.done.length > 0,
    completedVia: s.completedVia,
  };
  return cachedSnapshot;
}

export function subscribeJourney(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mark the active step done (no-op for done/locked steps — see applyStepDone). */
export function completeJourneyStep(step: JourneyStepId): void {
  const s = current();
  const done = applyStepDone(s.done, step);
  if (done.length === s.done.length) return;
  setStored({
    v: 1,
    done,
    completedVia: isJourneyComplete(done) ? "steps" : s.completedVia,
  });
}

/** Grandfathering: linked accounts on boot = the user predates the journey.
 *  Marks everything done so the gate never renders for them. Refused once the
 *  user has journey progress — a mid-journey user returning from OAuth is
 *  completing step 3, not being grandfathered. */
export function grandfatherJourney(): void {
  const s = current();
  if (isJourneyComplete(s.done) || s.done.length > 0) return;
  setStored({ v: 1, done: [...JOURNEY_STEPS], completedVia: "grandfathered" });
}

/** Honest escape hatch: the device can't run the local agent (no WebGPU /
 *  tiny GPU), so the journey's steps are impossible. The user may continue
 *  to the mail workspace; completedVia records that nothing was earned. */
export function skipJourneyUnsupportedDevice(): void {
  const s = current();
  if (isJourneyComplete(s.done)) return;
  setStored({
    v: 1,
    done: [...JOURNEY_STEPS],
    completedVia: "unsupported-device",
  });
}

/** Re-read persisted state and notify subscribers. Needed after a vault
 *  import writes accountbox:journey into localStorage behind the store's
 *  in-memory cache (no page reload happens in that flow). */
export function refreshJourneyFromStorage(): void {
  stored = readStorage();
  cachedSnapshot = null;
  cachedFor = null;
  for (const fn of listeners) fn();
}

/** Test/dev hook: forget in-memory state so the next read hits storage. */
export function __resetJourneyForTests(): void {
  stored = null;
  cachedSnapshot = null;
  cachedFor = null;
}
