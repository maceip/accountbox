import {
  opfsDelete,
  opfsGet,
  opfsList,
  opfsOpen,
  opfsPut,
} from "@/lib/db/opfs";
import { getVaultState } from "@/lib/vault/store";

export const CONNECTIONS_CHANGED_EVENT = "accountbox:connections-changed";

export const GOOGLE_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

export type GoogleProviderConfig = {
  providerId: "google";
  clientId: string;
  scopes: string[];
  updatedAt: number;
};

export type ConnectedGmailAccount = {
  providerId: "google";
  accountId: string;
  email: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
  connectedAt: number;
  updatedAt: number;
};

type EncryptedJson = {
  version: 1;
  alg: "AES-GCM";
  iv: string;
  ciphertext: string;
};

const CONFIG_TABLE = "provider_config";
const ACCOUNT_TABLE = "connected_account";
const GOOGLE_CONFIG_ID = "google";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function vaultKey(): CryptoKey {
  const vault = getVaultState();
  if (vault.status !== "unlocked" || !vault.key) {
    throw new Error("Unlock the workspace before connecting a source.");
  }
  return vault.key;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptedRecordId(providerId: string, accountId: string) {
  return `${providerId}:${await sha256Hex(accountId.toLowerCase())}`;
}

async function encryptJson(value: unknown): Promise<EncryptedJson> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey(),
    encoder.encode(JSON.stringify(value)),
  );
  return {
    version: 1,
    alg: "AES-GCM",
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

async function decryptJson<T>(record: EncryptedJson): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(record.iv) },
    vaultKey(),
    base64UrlToBytes(record.ciphertext),
  );
  return JSON.parse(decoder.decode(plain)) as T;
}

export async function saveGoogleProviderConfig(clientId: string) {
  await opfsOpen();
  const config: GoogleProviderConfig = {
    providerId: "google",
    clientId: clientId.trim(),
    scopes: [...GOOGLE_GMAIL_SCOPES],
    updatedAt: Date.now(),
  };
  await opfsPut(CONFIG_TABLE, GOOGLE_CONFIG_ID, await encryptJson(config));
  return config;
}

export async function loadGoogleProviderConfig() {
  await opfsOpen();
  const record = await opfsGet<EncryptedJson>(CONFIG_TABLE, GOOGLE_CONFIG_ID);
  return record ? decryptJson<GoogleProviderConfig>(record) : null;
}

export async function saveConnectedGmailAccount(
  account: Omit<
    ConnectedGmailAccount,
    "providerId" | "connectedAt" | "updatedAt"
  >,
) {
  await opfsOpen();
  const now = Date.now();
  const existing = await getConnectedGmailAccount(account.accountId).catch(
    () => null,
  );
  const connected: ConnectedGmailAccount = {
    ...account,
    providerId: "google",
    connectedAt: existing?.connectedAt ?? now,
    updatedAt: now,
  };
  await opfsPut(
    ACCOUNT_TABLE,
    await encryptedRecordId("google", connected.accountId),
    await encryptJson(connected),
  );
  window.dispatchEvent(new Event(CONNECTIONS_CHANGED_EVENT));
  return connected;
}

export async function listConnectedGmailAccounts() {
  await opfsOpen();
  const records = await opfsList<EncryptedJson>(ACCOUNT_TABLE);
  const accounts: ConnectedGmailAccount[] = [];
  for (const record of records) {
    try {
      const account = await decryptJson<ConnectedGmailAccount>(record.data);
      if (account.providerId === "google") accounts.push(account);
    } catch {
      // Ignore records encrypted for a different/corrupt vault key.
    }
  }
  return accounts.sort((a, b) => a.email.localeCompare(b.email));
}

export async function getConnectedGmailAccount(accountId: string) {
  const records = await listConnectedGmailAccounts();
  return (
    records.find(
      (account) =>
        account.accountId === accountId ||
        account.email.toLowerCase() === accountId.toLowerCase(),
    ) ?? null
  );
}

export async function getGmailAccessToken(accountId: string) {
  const account = await getConnectedGmailAccount(accountId);
  if (!account) throw new Error("Connect Gmail first.");
  if (account.expiresAt <= Date.now() + 60_000) {
    throw new Error("Gmail token expired. Reconnect Gmail.");
  }
  return account.accessToken;
}

export async function removeConnectedGmailAccount(accountId: string) {
  const account = await getConnectedGmailAccount(accountId);
  if (!account) return;
  await opfsDelete(
    ACCOUNT_TABLE,
    await encryptedRecordId("google", account.accountId),
  );
  window.dispatchEvent(new Event(CONNECTIONS_CHANGED_EVENT));
}
