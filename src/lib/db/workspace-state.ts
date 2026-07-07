/**
 * Durable workspace state — things the user did that must survive a reload
 * (user decision 2026-07-06). Backed by OPFS SQLite via `opfs.ts`.
 *
 * HONESTY CONTRACT: these are records of what the user last did, never live
 * state. An engine is gone after reload, so nothing here may render as
 * "equipped" — consumers may only offer a fast re-equip of the recorded
 * adapter. Private mail NEVER belongs here.
 */
import { opfsGet, opfsPut } from "./opfs";

const TABLE = "workspace_state";
const LAST_EQUIPPED_ID = "last-equipped";

export type LastEquippedRecord = {
  skillId: string;
  adapterUrl: string;
  adapterVersion: string | null;
  equippedAt: number;
};

/** Best-effort: a storage failure must never fail an equip. */
export function recordLastEquipped(record: LastEquippedRecord): void {
  void opfsPut(TABLE, LAST_EQUIPPED_ID, record).catch((e) => {
    console.warn("[workspace-state] failed to persist last-equipped", e);
  });
}

export async function getLastEquipped(): Promise<LastEquippedRecord | null> {
  try {
    return await opfsGet<LastEquippedRecord>(TABLE, LAST_EQUIPPED_ID);
  } catch {
    return null;
  }
}
