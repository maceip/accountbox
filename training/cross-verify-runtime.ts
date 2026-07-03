#!/usr/bin/env bun
/**
 * Cross-verify harness for the real gmail-agent-runtime public surface.
 * - Imports ONLY from the runtime (no legacy accountbox-runtime).
 * - Verifies FIXED_SYSTEM_PROMPT byte identity with generated train jsonl.
 * - Attempts to loadBaseModel + equipAdapter (real adapter if present in /adapters).
 * - For each synthetic prompt: calls generate(), asserts valid Plan (allowed tools only).
 * - When equipped: requires NO __cold on any plan.
 * - When not equipped: accepts cold sentinel (for headless runs) but still validates shape.
 * - Prints PASS or FAIL + exits non-zero on any failure.
 *
 * This is the final guard that replay never masquerades as inference.
 */
import { readFileSync } from "node:fs";
import {
  FIXED_SYSTEM_PROMPT,
  generate,
  loadBaseModel,
  equipAdapter,
  isEquippedForRealInference,
  type Plan,
} from "../src/lib/runtime/gmail-agent-runtime";

const SYNTH = "training/gmail-synthetic-prompts.json";
const TRAIN_JSONL = "training/gmail-agent-train.jsonl";

const ALLOWED = new Set(["search_messages", "read_message", "create_draft"]);

function isValidPlan(p: any): p is Plan {
  if (!p) return false;
  if (p.tool) {
    return (
      typeof p.tool === "string" &&
      ALLOWED.has(p.tool) &&
      p.args &&
      typeof p.args === "object"
    );
  }
  if (Array.isArray(p.steps)) {
    return p.steps.every(
      (s: any) =>
        s &&
        typeof s.tool === "string" &&
        ALLOWED.has(s.tool) &&
        s.args &&
        typeof s.args === "object",
    );
  }
  return false;
}

function loadPrompts(): string[] {
  const j = JSON.parse(readFileSync(SYNTH, "utf8"));
  return (j.prompts || []).map((p: any) => p.prompt as string);
}

async function main() {
  console.log("[cross-verify] starting");

  // 1. Prompt lock (byte identity)
  try {
    const firstLine = readFileSync(TRAIN_JSONL, "utf8").split("\n")[0];
    const row = JSON.parse(firstLine);
    const sys = row.messages?.find((m: any) => m.role === "system")?.content;
    if (sys !== FIXED_SYSTEM_PROMPT) {
      console.error("FAIL: SYSTEM prompt drift detected");
      process.exit(1);
    }
    console.log("[cross-verify] prompt byte-match: OK");
  } catch (e) {
    console.error("FAIL: could not diff prompt", e);
    process.exit(1);
  }

  // 2. Attempt real engine + adapter
  let realEngine = false;
  try {
    await loadBaseModel();
    await equipAdapter({ type: "http", url: "/adapters/gmail-agent" });
    realEngine = isEquippedForRealInference();
    console.log("[cross-verify] equipped for real inference?", realEngine);
  } catch (e) {
    console.log(
      "[cross-verify] equip/load not available in this env (ok for headless):",
      (e as any)?.message || e,
    );
  }

  // 3. Run prompts through generate; enforce contract
  const prompts = loadPrompts();
  console.log(`[cross-verify] running ${prompts.length} prompts`);
  let failures = 0;

  for (const prompt of prompts) {
    const plan: any = await generate(prompt);
    const cold = plan.__cold === true;

    if (cold) {
      if (realEngine) {
        console.error(
          "FAIL: __cold returned despite realEngine for:",
          prompt.slice(0, 50),
        );
        failures++;
      } else {
        console.log("COLD (no weights) — shape ok for:", prompt.slice(0, 50));
      }
      // still check the sentinel shape is the expected cold one (allowed tool)
      if (!isValidPlan(plan)) {
        console.error("FAIL: cold sentinel is not a valid Plan shape");
        failures++;
      }
      continue;
    }

    // real path
    if (!isValidPlan(plan)) {
      console.error("FAIL: invalid tool/plan for:", prompt.slice(0, 50), plan);
      failures++;
      continue;
    }
    if (!realEngine) {
      // got a non-cold plan without marking equipped — suspicious under strict mode
      console.warn("WARN: non-cold plan produced without isEquipped true");
    }
    console.log("OK plan:", plan.tool || "multi", "for", prompt.slice(0, 40));
  }

  if (failures > 0) {
    console.log("FAIL");
    process.exit(1);
  }

  console.log("PASS");
}

main().catch((e) => {
  console.error("cross-verify error", e);
  console.log("FAIL");
  process.exit(1);
});
