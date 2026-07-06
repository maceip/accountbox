#!/usr/bin/env bun
/**
 * Guard: src/engine is a cordoned module (the pure WebGPU kernels/runtime,
 * lineage vibethinker-webgpu-lora -> emberglass -> vendored here) so it can be
 * extracted to its own repo later without surgery. Two rules:
 *
 *   1. Engine code never imports app code — nothing under src/engine may
 *      reference `@/`, `~/`, or a relative path that resolves outside
 *      src/engine.
 *   2. App code touches the engine only through the seam files listed in
 *      APP_SEAMS (plus *.test.* files). Everything else goes through those
 *      seams' exports, not `@/engine/...` directly.
 *
 * Run: bun run check:engine-boundary  (wired into the proof-gate list)
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = process.cwd();
const ENGINE = resolve(ROOT, "src/engine");
const APP_SEAMS = new Set([
  "src/lib/runtime/weight-fetch.ts", // inference: loads the emberglass bridge
  "src/lib/agents/train-runtime.ts", // training: TrainingController/GRPO/LoRA export
]);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

let failures = 0;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "routeTree.gen.ts") continue;
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (TEXT_EXT.test(name)) yield p;
  }
}

function importsOf(p: string): Array<{ spec: string; line: number }> {
  const out: Array<{ spec: string; line: number }> = [];
  const lines = readFileSync(p, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(IMPORT_RE)) {
      out.push({ spec: m[1], line: i + 1 });
    }
  }
  return out;
}

// Rule 1: engine never reaches out.
for (const p of walk(ENGINE)) {
  const rel = p.slice(ROOT.length + 1);
  for (const { spec, line } of importsOf(p)) {
    if (spec.startsWith("@/") || spec.startsWith("~/")) {
      console.error(`${rel}:${line}: engine imports app alias '${spec}'`);
      failures++;
    } else if (spec.startsWith(".")) {
      const target = resolve(dirname(p), spec);
      if (!target.startsWith(ENGINE + "/") && target !== ENGINE) {
        console.error(`${rel}:${line}: engine relative import escapes src/engine: '${spec}'`);
        failures++;
      }
    }
  }
}

// Rule 2: app code imports the engine only from the seam files.
for (const p of walk(resolve(ROOT, "src"))) {
  if (p.startsWith(ENGINE + "/")) continue;
  const rel = p.slice(ROOT.length + 1);
  if (APP_SEAMS.has(rel) || /\.test\.[tj]sx?$/.test(rel)) continue;
  for (const { spec, line } of importsOf(p)) {
    const target = spec.startsWith("@/")
      ? resolve(ROOT, "src", spec.slice(2))
      : spec.startsWith(".")
        ? resolve(dirname(p), spec)
        : null;
    if (target && (target.startsWith(ENGINE + "/") || target === ENGINE)) {
      console.error(
        `${rel}:${line}: direct engine import '${spec}' — go through a seam (${[...APP_SEAMS].join(", ")})`,
      );
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\ncheck:engine-boundary FAILED — ${failures} violation(s)`);
  process.exit(1);
}
console.log("check:engine-boundary OK — engine is cordoned; app touches it only at the seams");
