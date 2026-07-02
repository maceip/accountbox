import { opfsGet, opfsOpen, opfsPut } from "@/lib/db/opfs";
import type { VaultEnvelope } from "./crypto";

const TABLE = "vault_envelope";
const ID = "local";

export async function loadVaultEnvelope(): Promise<VaultEnvelope | null> {
  await opfsOpen();
  return opfsGet<VaultEnvelope>(TABLE, ID);
}

export async function saveVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  await opfsOpen();
  await opfsPut(TABLE, ID, envelope);
}
