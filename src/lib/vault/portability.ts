/**
 * Vault portability — the deliberately simple answer to "I opened the app in
 * another browser/device and my stuff is gone".
 *
 * A vault export is a small JSON file containing:
 *   - the vault ENVELOPE: already ciphertext under the master-password KDF
 *     (exporting it grants nothing without the master password), and
 *   - the vault IDENTITY: the per-browser Better Auth email. Importing pins it,
 *     so unlock signs into the SAME server user — which is exactly what makes
 *     Gmail connections reappear on the new browser/device.
 *
 * No server sync, no new crypto, no key material anywhere in the file.
 */

import type { VaultEnvelope } from './crypto';
import { loadVaultEnvelope, saveVaultEnvelope } from './opfs-store';
import { getVaultIdentity, pinVaultIdentity, vaultEmailForUnlock } from './constants';

const KIND = 'accountbox-vault-export';

export type VaultExport = {
  kind: typeof KIND;
  version: 1;
  exportedAt: string;
  identity: string;
  envelope: VaultEnvelope;
};

export async function buildVaultExport(): Promise<VaultExport> {
  const envelope = await loadVaultEnvelope();
  if (!envelope) throw new Error('No vault exists in this browser to export.');
  return {
    kind: KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    identity: getVaultIdentity() ?? vaultEmailForUnlock(),
    envelope,
  };
}

/** Trigger a browser download of the export file. */
export async function downloadVaultExport(): Promise<void> {
  const data = await buildVaultExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'accountbox-vault.json';
  a.click();
  URL.revokeObjectURL(url);
}

function isVaultExport(x: any): x is VaultExport {
  return (
    x &&
    x.kind === KIND &&
    x.version === 1 &&
    typeof x.identity === 'string' &&
    x.envelope &&
    typeof x.envelope.ciphertext === 'string' &&
    typeof x.envelope.iv === 'string' &&
    typeof x.envelope.authSalt === 'string' &&
    typeof x.envelope.vaultSalt === 'string' &&
    typeof x.envelope.iterations === 'number'
  );
}

/**
 * Import a vault file into this browser: store the envelope in OPFS and pin
 * the identity. The caller then shows the normal Unlock form — the master
 * password stays the only secret, exactly as on the original browser.
 */
export async function importVaultFile(file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not a vault export (invalid JSON).');
  }
  if (!isVaultExport(parsed)) {
    throw new Error('That file is not an AccountBox vault export.');
  }
  const existing = await loadVaultEnvelope();
  if (existing) {
    throw new Error('This browser already has a vault. Importing over it is not supported yet.');
  }
  await saveVaultEnvelope(parsed.envelope);
  pinVaultIdentity(parsed.identity);
}
