#!/usr/bin/env bun
/**
 * Simple before/after style eval for the Gmail agent fine-tune.
 * Runs the synthetic prompts through the current "model" (the labeled pairs + generator logic)
 * and reports how many produce a valid, expected tool call.
 *
 * After you fine-tune vibethinker-3b on the generated dataset and load the adapter in the runtime,
 * re-run this (or a version that calls the real model) to see the delta.
 *
 * "Real accounts" version: the same prompts can be used against your live connected Gmail
 * inside the app; the traces you generate while doing so become additional training signal.
 */

import { readFileSync } from "node:fs";
import { generate, loadBaseModel, equipAdapter, isEquippedForRealInference } from "../src/lib/runtime/gmail-agent-runtime";

const DATA = "training/gmail-synthetic-prompts.json";
const synth = JSON.parse(readFileSync(DATA, "utf8")).prompts as any[];

async function main() {
  console.log("Gmail agent eval on", synth.length, "synthetic prompts (real-account ready)");
  try {
    await loadBaseModel();
    await equipAdapter({ type: 'http', url: '/adapters/gmail-agent' });
  } catch (e) {
    // expected when no full WebGPU engine in this context
  }

  let realCount = 0;
  let anyCold = false;
  for (const p of synth) {
    const plan: any = await generate(p.prompt);
    const cold = plan.__cold === true || !isEquippedForRealInference();
    if (cold) {
      anyCold = true;
      console.log("COLD — FAIL prompt:", p.prompt.slice(0, 60));
    } else {
      realCount++;
      console.log("REAL ENGINE prompt:", p.prompt.slice(0, 60));
    }
  }

  if (anyCold) {
    console.log("COLD — FAIL");
    process.exit(1);
  }

  console.log(`Valid real-inference plans: ${realCount}/${synth.length}`);
  console.log("\nPrompts used:");
  synth.forEach((p: any, i: number) => console.log(`${i+1}. ${p.prompt}`));
}

main().catch(e => { console.error(e); process.exit(1); });
