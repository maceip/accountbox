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
 * Then launch adapter training (see scripts/run-gmail-finetune.sh).
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
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

// Provenance gate for real traces (v1 contract). A trace recorded under a
// DIFFERENT system prompt is stale — training on it would teach the model
// responses to instructions it will never see again.
const CURRENT_PROMPT_SHA = createHash("sha256").update(SYSTEM).digest("hex");

type RealPair = {
  prompt: string;
  tool_calls: Array<{ name: string; args: any }>;
};

function planToCalls(plan: any): Array<{ name: string; args: any }> {
  if (plan?.steps)
    return plan.steps.map((s: any) => ({ name: s.tool, args: s.args ?? {} }));
  if (plan?.tool) return [{ name: plan.tool, args: plan.args ?? {} }];
  return [];
}

/** Normalize one raw entry. Returns the pair, or a reason it was excluded. */
function normalizeTrace(
  raw: any,
): RealPair | "foreign-skill" | "stale-prompt" | "junk" {
  if (!raw || typeof raw !== "object") return "junk";
  if (raw.v === 1) {
    if (raw.skillId !== "gmail-agent") return "foreign-skill";
    // null hash = pre-contract legacy trace (provenance honestly unknown; kept).
    if (raw.promptSha256 != null && raw.promptSha256 !== CURRENT_PROMPT_SHA)
      return "stale-prompt";
    const calls = planToCalls(raw.plan);
    if (typeof raw.prompt !== "string" || !calls.length) return "junk";
    return { prompt: raw.prompt, tool_calls: calls };
  }
  // Pre-contract shape: bare {prompt, tool_calls}.
  if (
    typeof raw.prompt === "string" &&
    Array.isArray(raw.tool_calls) &&
    raw.tool_calls.length
  )
    return { prompt: raw.prompt, tool_calls: raw.tool_calls };
  return "junk";
}

/** Accepts Settings→Developer export files ({kind, traces:[...]}), bare
 *  arrays, and single-trace objects — all dropped into training/real-traces/. */
function loadReal(): RealPair[] {
  if (!existsSync(TRACES_DIR)) return [];
  const rawEntries: any[] = [];
  for (const f of readdirSync(TRACES_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const parsed = JSON.parse(readFileSync(join(TRACES_DIR, f), "utf8"));
      if (
        parsed?.kind === "accountbox-trace-export" &&
        Array.isArray(parsed.traces)
      )
        rawEntries.push(...parsed.traces);
      else if (Array.isArray(parsed)) rawEntries.push(...parsed);
      else rawEntries.push(parsed);
    } catch {
      console.warn(`skipping unparseable trace file: ${f}`);
    }
  }
  const pairs: RealPair[] = [];
  const excluded = { "foreign-skill": 0, "stale-prompt": 0, junk: 0 };
  for (const raw of rawEntries) {
    const out = normalizeTrace(raw);
    if (typeof out === "string") excluded[out]++;
    else pairs.push(out);
  }
  if (excluded["stale-prompt"] || excluded["foreign-skill"] || excluded.junk) {
    console.log(
      `real traces excluded: ${excluded["stale-prompt"]} stale-prompt, ${excluded["foreign-skill"]} foreign-skill, ${excluded.junk} junk`,
    );
  }
  return pairs;
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
