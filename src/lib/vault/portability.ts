/**
 * Vault portability — the deliberately simple answer to "I opened the app in
 * another browser/device and my stuff is gone".
 *
 * A vault export is a small JSON file containing:
 *   - the vault ENVELOPE: already ciphertext under the master-password KDF
 *     (exporting it grants nothing without the master password),
 *   - the vault IDENTITY: the per-browser Better Auth email. Importing pins it,
 *     so unlock signs into the SAME server user — which is exactly what makes
 *     Gmail connections reappear on the new browser/device,
 *   - (v2) LOCAL PREFERENCES: the bm.* localStorage keys (settings, tile
 *     layout, workspaces, account scope) so the new browser looks familiar.
 *
 * Transport is the user's choice:
 *   - file download / file picker (works everywhere), or
 *   - a user-chosen local folder via the File System Access API (Chrome/Edge)
 *     — "share a folder with the browser", handy for synced folders
 *     (Dropbox/Drive/iCloud) which then carry the vault between machines.
 *
 * No server sync, no new crypto, no key material anywhere in the file.
 */

import type { VaultEnvelope } from './crypto';
import { loadVaultEnvelope, saveVaultEnvelope } from './opfs-store';
import { getVaultIdentity, pinVaultIdentity, vaultEmailForUnlock } from './constants';
import { refreshJourneyFromStorage } from '@/lib/journey/journey';

const KIND = 'accountbox-vault-export';
export const VAULT_FILENAME = 'accountbox-workspace.json';
/** Pre-rename export name — folder loads still find it (KIND check is what
 *  actually validates the payload, not the name). */
const LEGACY_FILENAME = 'accountbox-vault.json';

/** localStorage keys worth carrying to a new browser (preferences + journey
 *  progression — a user who finished the journey shouldn't redo it after
 *  importing their vault elsewhere). */
const LOCAL_KEYS = [
  'bm.settings',
  'bm.tiles-layout',
  'bm.workspaces',
  'bm.account-scope',
  'accountbox:journey',
] as const;

export type VaultExport = {
  kind: typeof KIND;
  version: 1 | 2;
  exportedAt: string;
  identity: string;
  envelope: VaultEnvelope;
  /** v2: bm.* preference keys captured at export time */
  local?: Record<string, string>;
};

export async function buildVaultExport(): Promise<VaultExport> {
  const envelope = await loadVaultEnvelope();
  if (!envelope) throw new Error('No vault exists in this browser to export.');
  const local: Record<string, string> = {};
  for (const k of LOCAL_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) local[k] = v;
    } catch {}
  }
  return {
    kind: KIND,
    version: 2,
    exportedAt: new Date().toISOString(),
    identity: getVaultIdentity() ?? vaultEmailForUnlock(),
    envelope,
    local,
  };
}

/** Pure parse+validate so it's unit-testable. Accepts v1 and v2. */
export function parseVaultExport(text: string): VaultExport {
  let x: any;
  try {
    x = JSON.parse(text);
  } catch {
    throw new Error('That file is not a vault export (invalid JSON).');
  }
  const ok =
    x &&
    x.kind === KIND &&
    (x.version === 1 || x.version === 2) &&
    typeof x.identity === 'string' &&
    x.envelope &&
    typeof x.envelope.ciphertext === 'string' &&
    typeof x.envelope.iv === 'string' &&
    typeof x.envelope.authSalt === 'string' &&
    typeof x.envelope.vaultSalt === 'string' &&
    typeof x.envelope.iterations === 'number' &&
    (x.local === undefined || (typeof x.local === 'object' && x.local !== null));
  if (!ok) throw new Error('That file is not an AccountBox vault export.');
  return x as VaultExport;
}

async function applyImport(data: VaultExport): Promise<void> {
  const existing = await loadVaultEnvelope();
  if (existing) {
    throw new Error('This browser already has a vault. Importing over it is not supported yet.');
  }
  await saveVaultEnvelope(data.envelope);
  pinVaultIdentity(data.identity);
  if (data.local) {
    for (const k of LOCAL_KEYS) {
      const v = data.local[k];
      if (typeof v === 'string') {
        try {
          localStorage.setItem(k, v);
        } catch {}
      }
    }
    // The journey store caches in module memory; imports happen without a
    // reload, so tell it the persisted state changed underneath it.
    refreshJourneyFromStorage();
  }
}

/* ------------------------------ file transport --------------------------- */

/** Trigger a browser download of the export file. */
export async function downloadVaultExport(): Promise<void> {
  const data = await buildVaultExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = VAULT_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a vault file picked by the user; then show the normal Unlock form. */
export async function importVaultFile(file: File): Promise<void> {
  await applyImport(parseVaultExport(await file.text()));
}

/* ----------------------------- folder transport -------------------------- */
/* File System Access API (Chrome/Edge). The user picks a folder once; we    */
/* read/write accountbox-vault.json inside it. Pointing this at a synced     */
/* folder (Drive/Dropbox/iCloud) makes the vault follow the user's machines. */

export function folderShareSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function saveVaultToFolder(): Promise<string> {
  const data = await buildVaultExport();
  const dir: any = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'accountbox-vault' });
  const fh = await dir.getFileHandle(VAULT_FILENAME, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
  return `${dir.name}/${VAULT_FILENAME}`;
}

export async function loadVaultFromFolder(): Promise<void> {
  const dir: any = await (window as any).showDirectoryPicker({ mode: 'read', id: 'accountbox-vault' });
  let fh: any;
  try {
    fh = await dir.getFileHandle(VAULT_FILENAME);
  } catch {
    try {
      fh = await dir.getFileHandle(LEGACY_FILENAME);
    } catch {
      throw new Error(`No ${VAULT_FILENAME} found in "${dir.name}".`);
    }
  }
  const file: File = await fh.getFile();
  await applyImport(parseVaultExport(await file.text()));
}
