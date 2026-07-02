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
