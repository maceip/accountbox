#!/usr/bin/env bun
/**
 * Guard: cartridges are swappable. The generic layer must reach skills only
 * through the `SKILLS`/`SOURCES` registries — never by importing a specific
 * cartridge (`@/lib/skills/gmail/*`, `@/lib/skills/github/*`, …). That's the
 * property that keeps "add a 3rd/4th/5th cartridge" a matter of writing
 * `src/lib/skills/<id>/` + two registry lines, with zero edits to runtime,
 * agents, or workbench UI.
 *
 * Allowed to import a specific cartridge: the cartridge's own directory, the
 * registries, the server executor registry, the Gmail compatibility runtime
 * (a documented legacy shim), and tests.
 *
 * Run: bun run check:cartridge-boundary  (wired into the proof-gate list)
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IMPORT_RE = /(?:from\s*|import\s*\(\s*)["'](@\/lib\/skills\/[^"']+)["']/g;

// Files/dirs allowed to name a specific cartridge module.
const ALLOW = [
  "src/lib/skills/", // any cartridge's own code + the registry (index.ts)
  "src/lib/sources/index.ts", // source registry wires each cartridge's skill
  "src/lib/runtime/gmail-agent-runtime.ts", // documented legacy compat shim
];

function allowed(rel: string): boolean {
  if (/\.test\.[tj]sx?$/.test(rel)) return true;
  return ALLOW.some((a) => rel === a || rel.startsWith(a));
}

// A specific-cartridge import = deeper than the registry root, e.g.
// "@/lib/skills/gmail/skill" — but NOT "@/lib/skills" or "@/lib/skills/eval".
const GENERIC_SKILL_MODULES = new Set([
  "@/lib/skills",
  "@/lib/skills/index",
  "@/lib/skills/eval",
  "@/lib/skills/eval-run",
  "@/lib/skills/executor.server",
]);

let failures = 0;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (lstatSync(p).isDirectory()) yield* walk(p);
    else if (TEXT_EXT.test(name)) yield p;
  }
}

for (const p of walk(SRC)) {
  const rel = p.slice(ROOT.length + 1);
  if (allowed(rel)) continue;
  const lines = readFileSync(p, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (GENERIC_SKILL_MODULES.has(spec)) continue;
      // deeper than the registry = a specific cartridge module
      console.error(
        `${rel}:${i + 1}: generic layer imports a specific cartridge '${spec}' — go through the SKILLS/SOURCES registry`,
      );
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(
    `\ncheck:cartridge-boundary FAILED — ${failures} cartridge-specific import(s) in the generic layer`,
  );
  process.exit(1);
}
console.log(
  "check:cartridge-boundary OK — generic layer reaches cartridges only via the registry",
);
