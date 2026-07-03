import { test, expect } from "bun:test";
import { parseVaultExport } from "./portability";

const envelope = {
  version: 1,
  kdf: "PBKDF2-SHA256",
  iterations: 600000,
  authSalt: "as",
  vaultSalt: "vs",
  iv: "iv",
  ciphertext: "ct",
};

test("accepts a v1 export (no local prefs)", () => {
  const v1 = {
    kind: "accountbox-vault-export",
    version: 1,
    exportedAt: "x",
    identity: "a@vault.localhost",
    envelope,
  };
  const parsed = parseVaultExport(JSON.stringify(v1));
  expect(parsed.identity).toBe("a@vault.localhost");
  expect(parsed.local).toBeUndefined();
});

test("accepts a v2 export with local prefs", () => {
  const v2 = {
    kind: "accountbox-vault-export",
    version: 2,
    exportedAt: "x",
    identity: "b@vault.localhost",
    envelope,
    local: { "bm.settings": "{}" },
  };
  const parsed = parseVaultExport(JSON.stringify(v2));
  expect(parsed.local?.["bm.settings"]).toBe("{}");
});

test("rejects invalid JSON", () => {
  expect(() => parseVaultExport("{nope")).toThrow(/invalid JSON/);
});

test("rejects wrong kind / missing envelope fields", () => {
  expect(() =>
    parseVaultExport(
      JSON.stringify({ kind: "other", version: 2, identity: "x", envelope }),
    ),
  ).toThrow(/not an AccountBox/);
  const bad = {
    kind: "accountbox-vault-export",
    version: 2,
    identity: "x",
    envelope: { ...envelope, ciphertext: undefined },
  };
  expect(() => parseVaultExport(JSON.stringify(bad))).toThrow(
    /not an AccountBox/,
  );
});

test("rejects unknown version", () => {
  expect(() =>
    parseVaultExport(
      JSON.stringify({
        kind: "accountbox-vault-export",
        version: 3,
        identity: "x",
        envelope,
      }),
    ),
  ).toThrow(/not an AccountBox/);
});
