export type VaultEnvelope = {
  id?: string;
  version: number;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  authSalt: string;
  vaultSalt: string;
  iv: string;
  ciphertext: string;
};

export type VaultPayload = {
  version: 1;
  items: unknown[];
};

export type PreparedVault = {
  envelope: VaultEnvelope;
  authPassword: string;
  payload: VaultPayload;
  key: CryptoKey;
};

const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function prepareNewVault(masterPassword: string) {
  const payload: VaultPayload = { version: 1, items: [] };
  const authSalt = randomBytes(16);
  const vaultSalt = randomBytes(16);
  const iv = randomBytes(12);
  const { authPassword, key } = await deriveVaultSecrets(masterPassword, {
    authSalt,
    vaultSalt,
    iterations: ITERATIONS,
  });
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  );

  return {
    authPassword,
    key,
    payload,
    envelope: {
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      authSalt: bytesToBase64Url(authSalt),
      vaultSalt: bytesToBase64Url(vaultSalt),
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    },
  } satisfies PreparedVault;
}

export function generateMasterPassword() {
  const value = bytesToBase64Url(randomBytes(24));
  const groups = value.match(/.{1,4}/g)?.join("-") ?? value;
  return `bbx-${groups}`;
}

export async function openVault(
  masterPassword: string,
  envelope: VaultEnvelope,
) {
  const { authPassword, key } = await deriveVaultSecrets(masterPassword, {
    authSalt: base64UrlToBytes(envelope.authSalt),
    vaultSalt: base64UrlToBytes(envelope.vaultSalt),
    iterations: envelope.iterations,
  });
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(envelope.iv) },
    key,
    base64UrlToBytes(envelope.ciphertext),
  );
  return {
    authPassword,
    key,
    payload: JSON.parse(decoder.decode(plain)) as VaultPayload,
  };
}

async function deriveVaultSecrets(
  masterPassword: string,
  {
    authSalt,
    vaultSalt,
    iterations,
  }: { authSalt: Uint8Array; vaultSalt: Uint8Array; iterations: number },
) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );
  const authBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(authSalt),
      iterations,
    },
    material,
    256,
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(vaultSalt),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return {
    authPassword: bytesToBase64Url(new Uint8Array(authBits)),
    key,
  };
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
