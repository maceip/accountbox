#!/usr/bin/env bun
/**
 * Batch plan quality eval for the training loop.
 * Feeds the 18 synthetic prompts (and any recorded traces) through the runtime's generate().
 * Scores the emitted plans for structural match to the expected tool use.
 * NO Gmail account, NO mail content, NO execution required.
 *
 * This is how we improve the training data / fine-tune without needing access.
 */

import {
  generate,
  loadBaseModel,
  equipAdapter,
  isEquippedForRealInference,
} from "../src/lib/runtime/gmail-agent-runtime";
import { readFileSync } from "node:fs";

const ALLOWED = new Set(["search_messages", "read_message", "create_draft"]);

function extractTools(plan: any): string[] {
  if (!plan) return [];
  if (plan.tool) return [plan.tool];
  if (Array.isArray(plan.steps))
    return plan.steps.map((s: any) => s.tool).filter(Boolean);
  return [];
}

function scorePlan(generatedPlan: any, targetPlan: any): number {
  const g = new Set(extractTools(generatedPlan));
  const t = new Set(extractTools(targetPlan));
  let s = 0;
  for (const x of t) if (g.has(x)) s += 1;
  for (const x of g) if (!ALLOWED.has(x)) s -= 1;
  // Fair scoring: perfect structural match on the expected tools = 1.0
  const denom = Math.max(1, t.size);
  let base = s / denom;
  // Small penalty only if extra disallowed tools were used
  if ([...g].some((x) => !ALLOWED.has(x))) base -= 0.1;
  return Math.max(0, Math.min(1, base));
}

function loadExamples() {
  const j = JSON.parse(
    readFileSync("training/gmail-synthetic-prompts.json", "utf8"),
  );
  return j.prompts.map((p: any) => {
    let target: any = { tool: "search_messages", args: { query: p.prompt } };
    const tlist = p.targets || [];
    if (tlist.length) {
      const f = tlist[0];
      target = f.tool
        ? { tool: f.tool, args: f.args }
        : { steps: f.steps || [] };
    }
    return { input: p.prompt, target };
  });
}

async function main() {
  console.log("Loading Gmail runtime with the shipped adapter (if present)...");
  try {
    await loadBaseModel();
    await equipAdapter({ type: "http", url: "/adapters/gmail-agent" });
  } catch (e) {
    console.log(
      "[eval-plans] load/equip did not produce equipped engine (node has no WebGPU):",
      (e as any)?.message || e,
    );
  }

  const examples = loadExamples();
  console.log(`Evaluating ${examples.length} examples (synthetic targets).`);

  let total = 0;
  let sawCold = false;
  for (const ex of examples) {
    const plan: any = await generate(ex.input);
    const cold = plan.__cold === true || !isEquippedForRealInference();
    if (cold) {
      sawCold = true;
      console.log(`COLD — FAIL  ${ex.input}`);
      console.log("  generated (cold sentinel):", JSON.stringify(plan));
    } else {
      console.log(`REAL ENGINE  ${ex.input}`);
    }
    const sc = scorePlan(plan, ex.target);
    total += sc;
    if (!cold) {
      console.log("  generated:", JSON.stringify(plan));
      console.log("  target   :", JSON.stringify(ex.target));
    }
  }
  if (sawCold) {
    console.log("COLD — FAIL");
    process.exit(1);
  }
  console.log(
    `\nAverage plan quality: ${(total / examples.length).toFixed(2)}`,
  );
  console.log(
    "\nInterpretation: 1.0 = perfect structural match on the allowed tools for the intent.",
  );
  console.log(
    "To improve: edit the synthetic prompts or the target plans in the runtime (or add real traces),",
  );
  console.log(
    "re-run generate-gmail-dataset.ts, then retrain in-browser via the Agents Lab trainer.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
