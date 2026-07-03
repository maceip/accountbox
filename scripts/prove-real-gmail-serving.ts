#!/usr/bin/env bun
/**
 * Mechanical proof for the trained/tuned Gmail agent serving platform.
 * This does what is possible from Node: file + contract checks.
 * Full proof (real weights → non-__cold plan) requires the browser + WebGPU.
 *
 * Run: bun run scripts/prove-real-gmail-serving.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ADAPTER_DIR = join(ROOT, "public/adapters/gmail-agent");
// The hardened machinery lives in the GENERIC runtime; Gmail is a skill
// manifest (skills/gmail) re-exported through the thin wrapper module.
const RUNTIME = join(ROOT, "src/lib/runtime/agent-runtime.ts");
const SKILL = join(ROOT, "src/lib/skills/gmail/skill.ts");

console.log("=== Prove: trained/tuned model serving platform ===\n");

let ok = true;

function check(name: string, cond: boolean, failMsg?: string) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ ${name}${failMsg ? ` — ${failMsg}` : ""}`);
    ok = false;
  }
}

// 1. Adapter files present (what the browser will fetch)
const cfg = join(ADAPTER_DIR, "adapter_config.json");
const weights = join(ADAPTER_DIR, "adapters.safetensors");
check("adapter_config.json served", existsSync(cfg));
check("adapters.safetensors served", existsSync(weights));
if (existsSync(weights)) {
  const { statSync } = await import("node:fs");
  const sz = statSync(weights).size;
  check(
    "adapter weights > 50MB",
    sz > 50 * 1024 * 1024,
    `size=${(sz / 1024 / 1024).toFixed(0)}MB`,
  );
}

// 2. Runtime contract (the serving code, shared by every skill)
const src = readFileSync(RUNTIME, "utf8");
check(
  "generate enforces equipped state",
  src.includes("!== 'equipped'") || src.includes('!== "equipped"'),
);
check("cold path returns __cold", src.includes("__cold: true"));
check("calls createEmberglassEngine", src.includes("createEmberglassEngine"));
check("supports loraUrl", src.includes("loraUrl"));
check(
  "exposes isEquippedForRealInference",
  src.includes("isEquippedForRealInference"),
);

// 2b. Gmail skill manifest (the data the runtime serves)
const skill = readFileSync(SKILL, "utf8");
check(
  "FIXED_SYSTEM_PROMPT present in manifest",
  skill.includes("FIXED_SYSTEM_PROMPT"),
);
check(
  "manifest declares tools as data",
  skill.includes("tools:") && skill.includes("search_messages"),
);

// 3. Chat uses the real surface only (chat body lives in agent-chat.tsx; the
// phone launcher in chat/local-chat.tsx is presentation-only)
const chat = readFileSync(
  join(ROOT, "src/components/agent/agent-chat.tsx"),
  "utf8",
);
// The chat routes every skill through the shared runtime registry (one REAL
// AgentRuntime instance per skill) — no mock/simulated path exists to import.
check(
  "chat routes through the real skill-runtime registry",
  chat.includes('from "@/lib/runtime/skill-runtimes"'),
);
check(
  "chat distinguishes REAL vs COLD",
  chat.includes("isCold") || chat.includes("isReal"),
);
check(
  "chat refuses cold execution",
  chat.includes("refusing execution") || chat.includes("__cold"),
);

console.log(`\n${ok ? "PASS (files + contract)" : "FAIL — see above"}`);
console.log(
  'Real end-to-end (weights → non-cold plan) still requires: bun run dev in browser with WebGPU + click "Load real LoRA"',
);
process.exit(ok ? 0 : 1);
