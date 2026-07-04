import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FIXED_SYSTEM_PROMPT } from "../src/lib/skills/gmail/skill";
import { stampAdapterManifest } from "./stamp-adapter-manifest";

function fakeAdapterDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "adapter-"));
  writeFileSync(join(dir, "adapters.safetensors"), "fake-weights");
  writeFileSync(join(dir, "adapter_config.json"), "{}");
  return dir;
}

describe("stampAdapterManifest", () => {
  test("writes identity with the byte-locked prompt hash", () => {
    const dir = fakeAdapterDir();
    const m = stampAdapterManifest(dir, {
      skillId: "gmail-agent",
      version: "v9",
    });
    expect(m.skillId).toBe("gmail-agent");
    expect(m.version).toBe("v9");
    expect(m.systemPromptSha256).toBe(
      createHash("sha256").update(FIXED_SYSTEM_PROMPT).digest("hex"),
    );
    const onDisk = JSON.parse(readFileSync(join(dir, "adapter.json"), "utf8"));
    expect(onDisk).toEqual(m);
  });

  test("keeps the existing version when none is given", () => {
    const dir = fakeAdapterDir();
    stampAdapterManifest(dir, { skillId: "gmail-agent", version: "v3" });
    const m = stampAdapterManifest(dir, { skillId: "gmail-agent" });
    expect(m.version).toBe("v3");
  });

  test("refuses directories without weights", () => {
    const dir = mkdtempSync(join(tmpdir(), "adapter-empty-"));
    expect(() => stampAdapterManifest(dir, { skillId: "gmail-agent" })).toThrow(
      /refusing to stamp/,
    );
  });

  test("refuses unknown skills — nothing to hash against", () => {
    const dir = fakeAdapterDir();
    expect(() => stampAdapterManifest(dir, { skillId: "nonexistent" })).toThrow(
      /unknown skill/,
    );
  });
});
