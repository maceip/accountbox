#!/usr/bin/env bun
/**
 * Stamp an adapter directory with its identity manifest (adapter.json).
 *
 * The manifest is the adapter's provenance: which skill it plans for, which
 * version it is, which base model it patches, and the sha256 of the
 * byte-locked system prompt it was trained against (B3). The runtime reads it
 * at equip time and stamps the version into every recorded trace.
 *
 * Usage:
 *   bun training/stamp-adapter-manifest.ts [dir] [--skill gmail-agent] [--version v2]
 *
 * Defaults: dir=public/adapters/gmail-agent, skill inferred from dir name,
 * version = bump of the existing manifest (v1 if none). Refuses to stamp a
 * directory without weights — an adapter.json describing nothing is worse
 * than none.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getSkill } from "../src/lib/skills";
import type { AdapterManifest } from "../src/lib/runtime/adapter-manifest";

export const BASE_MODEL = "VibeThinker-3B-q4f16_1-MLC";
const TRAIN_FILE = resolve(import.meta.dir, "gmail-agent-train.jsonl");

function countExamples(skillId: string): number | undefined {
  // Per-skill training files as skills grow; gmail keeps its historical name.
  const file =
    skillId === "gmail-agent"
      ? TRAIN_FILE
      : resolve(import.meta.dir, `${skillId}-train.jsonl`);
  if (!existsSync(file)) return undefined;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim()).length;
}

function bumpVersion(prev: string | undefined): string {
  const m = prev?.match(/^v(\d+)$/);
  return m ? `v${Number(m[1]) + 1}` : "v1";
}

export function stampAdapterManifest(
  dir: string,
  opts: { skillId?: string; version?: string } = {},
): AdapterManifest {
  const adapterDir = resolve(dir);
  const skillId = opts.skillId || basename(adapterDir);
  const skill = getSkill(skillId);
  if (!skill)
    throw new Error(`unknown skill "${skillId}" — nothing to stamp against`);

  const weights = join(adapterDir, "adapters.safetensors");
  if (!existsSync(weights)) {
    throw new Error(
      `no adapters.safetensors in ${adapterDir} — refusing to stamp`,
    );
  }
  if (!existsSync(join(adapterDir, "adapter_config.json"))) {
    throw new Error(
      `no adapter_config.json in ${adapterDir} — refusing to stamp`,
    );
  }

  const manifestPath = join(adapterDir, "adapter.json");
  let existing: AdapterManifest | undefined;
  if (existsSync(manifestPath)) {
    try {
      existing = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      ) as AdapterManifest;
    } catch {
      existing = undefined;
    }
  }

  const manifest: AdapterManifest = {
    skillId,
    version: opts.version || existing?.version || bumpVersion(undefined),
    baseModel: BASE_MODEL,
    systemPromptSha256: createHash("sha256")
      .update(skill.systemPrompt)
      .digest("hex"),
    trainedAt: statSync(weights).mtime.toISOString(),
    examples: countExamples(skillId),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
  );
  const dir = positional[0] || "public/adapters/gmail-agent";
  const manifest = stampAdapterManifest(dir, {
    skillId: flag("skill"),
    version: flag("version"),
  });
  console.log(`stamped ${resolve(dir)}/adapter.json`);
  console.log(JSON.stringify(manifest, null, 2));
}
