#!/usr/bin/env bun
/**
 * Guard: the repo must be self-contained. Nothing under the checked paths may
 * reference files outside this folder — no absolute /Users/mac paths, no
 * sibling-checkout imports (emberglass/bbverifier/etc), no escaping symlinks.
 *
 * Run: bun run check:self-contained  (wired into the proof-gate list)
 */
import { readdirSync, readFileSync, statSync, lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const CHECK_DIRS = ["src", "scripts", "test", "training"];
const CHECK_FILES = ["package.json", "vite.config.ts", "tsconfig.json"];
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html|sh)$/;

const BANNED: Array<{ re: RegExp; why: string }> = [
  { re: /\/Users\/mac\//, why: "absolute path outside the repo" },
  { re: /\.\.\/(\.\.\/)*emberglass/, why: "sibling emberglass checkout" },
  { re: /(?<![\w./-])~\/(emberglass|bbverifier|models|vibethinker)/, why: "home-dir sibling project" },
  { re: /file:\.\.\//, why: "file: dependency outside the repo" },
];

let failures = 0;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "routeTree.gen.ts") continue;
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      const target = realpathSync(p);
      if (!target.startsWith(ROOT + "/") && target !== ROOT) {
        console.error(`SYMLINK ESCAPE: ${p} -> ${target}`);
        failures++;
      }
      continue;
    }
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function checkFile(p: string) {
  if (!TEXT_EXT.test(p)) return;
  const rel = p.slice(ROOT.length + 1);
  const text = readFileSync(p, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { re, why } of BANNED) {
      if (re.test(lines[i])) {
        console.error(`${rel}:${i + 1}: ${why}\n    ${lines[i].trim().slice(0, 140)}`);
        failures++;
      }
    }
  }
}

for (const d of CHECK_DIRS) {
  const abs = resolve(ROOT, d);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const f of walk(abs)) checkFile(f);
}
for (const f of CHECK_FILES) checkFile(resolve(ROOT, f));

// Repo-root symlink escape check (model/, model-chat/ must be real dirs).
for (const name of readdirSync(ROOT)) {
  if (name === "node_modules" || name === ".git") continue;
  const p = join(ROOT, name);
  if (lstatSync(p).isSymbolicLink()) {
    const target = realpathSync(p);
    if (!target.startsWith(ROOT + "/")) {
      console.error(`SYMLINK ESCAPE: ${name} -> ${target}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\ncheck:self-contained FAILED — ${failures} external reference(s)`);
  process.exit(1);
}
console.log("check:self-contained OK — no references outside the repo folder");
