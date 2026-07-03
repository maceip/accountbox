/**
 * Engine-slot coordinator — ONE engine resident on the GPU at a time.
 *
 * Two models exist (chat = Qwen2.5-3B-Instruct, skills = VibeThinker-3B+LoRA)
 * but each is ~2GB as int4 working set; under a ~4.3GB maxBufferSize budget
 * they won't reliably coexist. So loading either model claims THE slot:
 * whichever engine currently holds it is disposed first, and its runtime is
 * told (onDisplaced) so it can show an honest `unloaded` status — never a
 * stale "ready" for weights that are gone.
 *
 * The cross-tab guarantee lives here too: the previous per-runtime Web Lock
 * moved into the coordinator, because an in-tab swap must NOT release/refight
 * the lock (that's how a same-tab swap would misreport "active in another
 * tab"). The lock is acquired when the first engine loads in this tab and
 * held for as long as ANY engine is resident; the browser releases it
 * automatically if the tab dies.
 */

const ENGINE_LOCK = "accountbox-agent-engine";

type SlotOwner = {
  id: string;
  /** Called when another model takes the slot: dispose GPU resources and set
   *  an honest `unloaded` status. Must not throw. */
  onDisplaced: () => void;
};

let owner: SlotOwner | null = null;
let releaseLock: (() => void) | null = null;

/** Pure decision: what claiming `requested` does to `current`. Unit-tested. */
export function slotDecision(
  current: string | null,
  requested: string,
): "acquire" | "keep" | "displace" {
  if (current === null) return "acquire";
  if (current === requested) return "keep";
  return "displace";
}

async function acquireCrossTabLock(): Promise<(() => void) | null | "unsupported"> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return "unsupported";
  return new Promise((resolveAcquire) => {
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    (navigator as any).locks
      .request(ENGINE_LOCK, { mode: "exclusive", ifAvailable: true }, (lock: unknown) => {
        if (!lock) {
          resolveAcquire(null); // another tab owns the engine
          return;
        }
        resolveAcquire(release);
        return held; // hold until release() or tab close
      })
      .catch(() => resolveAcquire("unsupported"));
  });
}

/**
 * Claim the slot for `id`. Returns false when another TAB owns the engine
 * (the caller should surface the honest cross-tab message). Within this tab,
 * a different resident model is displaced (disposed + told).
 */
export async function claimEngineSlot(id: string, onDisplaced: () => void): Promise<boolean> {
  if (!releaseLock) {
    const got = await acquireCrossTabLock();
    if (got === null) return false;
    if (got !== "unsupported") releaseLock = got;
  }
  const decision = slotDecision(owner?.id ?? null, id);
  if (decision === "displace" && owner) {
    try {
      owner.onDisplaced();
    } catch (e) {
      console.warn("[engine-slot] displaced owner threw during dispose:", e);
    }
  }
  owner = { id, onDisplaced };
  return true;
}

/** Release the slot (engine disposed by its own runtime). Only the owner may
 *  release; a stale release from a displaced runtime is a no-op. */
export function releaseEngineSlot(id: string): void {
  if (owner?.id !== id) return;
  owner = null;
  if (releaseLock) {
    releaseLock();
    releaseLock = null;
  }
}

export function currentEngineSlotOwner(): string | null {
  return owner?.id ?? null;
}

/** Test hook: drop slot + lock state without touching real GPU resources. */
export function __resetEngineSlotForTests(): void {
  owner = null;
  if (releaseLock) {
    releaseLock();
    releaseLock = null;
  }
}
