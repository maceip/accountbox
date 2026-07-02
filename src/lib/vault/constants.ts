// The vault's Better Auth user is an implementation detail (a per-browser
// session anchor). A fixed email means the FIRST browser to create a vault
// claims it and every other fresh browser's setup fails with "user exists" —
// fine for single-user self-host, fatal for a shared demo deployment. The
// identity is therefore generated at vault-CREATE time and pinned in
// localStorage; unlock uses the pinned identity, falling back to the legacy
// fixed email for vaults created before this change.
const VAULT_ID_KEY = "bm.vault-identity";
const LEGACY_VAULT_EMAIL = "vault@localhost";

function pinned(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(VAULT_ID_KEY);
  } catch {
    return null;
  }
}

/** Identity for creating a NEW vault: mint + pin a per-browser email. */
export function vaultEmailForCreate(): string {
  const existing = pinned();
  if (existing) return existing;
  try {
    // Dotted domain: Better Auth's email validation rejects single-label
    // domains like @localhost (server returns 400 "[body.email] Invalid input").
    const email = `vault-${crypto.randomUUID().slice(0, 13)}@vault.localhost`;
    localStorage.setItem(VAULT_ID_KEY, email);
    return email;
  } catch {
    return LEGACY_VAULT_EMAIL;
  }
}

/** Identity for unlocking an EXISTING vault: pinned if present, else legacy. */
export function vaultEmailForUnlock(): string {
  return pinned() ?? LEGACY_VAULT_EMAIL;
}

export const LOCAL_VAULT_NAME = "Local Vault";
