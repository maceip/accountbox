#!/usr/bin/env bun
/**
 * Real E2E training data generator for the Gmail agent.
 * - Starts with 18+ synthetic high-quality prompts (user provided intent).
 * - Merges any real traces recorded while using the app with a REAL connected Gmail account.
 * - Produces chat JSONL suitable for LoRA fine-tuning (vibethinker-3b / Qwen-style trainers).
 *
 * Output never contains email bodies, full subjects, or PII from your mailbox.
 * Only: the prompt you typed, structural Gmail queries / tool names, UI action types, and the tool plan.
 *
 * Run after using the app on your real account(s):
 *   bun run training/generate-gmail-dataset.ts
 *
 * Then launch the real fine-tune (see scripts/run-gmail-finetune.sh).
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import { FIXED_SYSTEM_PROMPT } from "../src/lib/runtime/gmail-agent-runtime";

const SYN = "training/gmail-synthetic-prompts.json";
// Balanced deterministic expansion (bun run training/expand-gmail-dataset.ts).
// Optional: merged when present.
const EXPANDED = "training/expanded-prompts.json";
const TRACES_DIR = "training/real-traces";
const OUT = "training/gmail-agent-train.jsonl";

const SYSTEM = FIXED_SYSTEM_PROMPT;

function make(prompt: string, calls: Array<{ name: string; args: any }>) {
  const content =
    calls.length <= 1
      ? JSON.stringify({ tool: calls[0].name, args: calls[0].args })
      : JSON.stringify({
          steps: calls.map((c) => ({ tool: c.name, args: c.args })),
        });
  return {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
      { role: "assistant", content },
    ],
  };
}

function loadSynth() {
  const j = JSON.parse(readFileSync(SYN, "utf8"));
  if (existsSync(EXPANDED)) {
    const x = JSON.parse(readFileSync(EXPANDED, "utf8"));
    j.prompts = j.prompts.concat(x.prompts);
  }
  return j.prompts.map((p: any) => {
    // Prefer the detailed "targets" array from the json (single source of truth after curation).
    // Each target is either {tool, args} or {steps: [...]}. Normalize to the call list format.
    let calls: Array<{ name: string; args: any }> = [];
    const tlist = p.targets || [];
    if (tlist.length > 0) {
      const first = tlist[0];
      if (first.tool) {
        calls = [{ name: first.tool, args: first.args }];
      } else if (first.steps) {
        calls = first.steps.map((s: any) => ({ name: s.tool, args: s.args }));
      }
    }
    if (!calls.length) {
      calls = [{ name: "search_messages", args: { query: p.prompt } }];
    }
    return { prompt: p.prompt, tool_calls: calls };
  });
}

function loadReal() {
  if (!existsSync(TRACES_DIR)) return [];
  return readdirSync(TRACES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(TRACES_DIR, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function main() {
  mkdirSync("training", { recursive: true });
  const synth = loadSynth();
  const real = loadReal();

  const examples: any[] = [];
  for (const s of synth) {
    examples.push(make(s.prompt, s.tool_calls));
  }
  for (const r of real) {
    if (r.prompt && r.tool_calls?.length)
      examples.push(make(r.prompt, r.tool_calls));
  }

  if (!examples.length) {
    console.error(
      "No examples. Generate synthetic pairs or enable trace recording in the app while using real Gmail.",
    );
    process.exit(1);
  }

  writeFileSync(OUT, `${examples.map((e) => JSON.stringify(e)).join("\n")}\n`);
  console.log(`Generated ${examples.length} examples → ${OUT}`);
  console.log(`Real traces: ${real.length}`);
}

main();
