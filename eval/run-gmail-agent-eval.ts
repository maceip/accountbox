#!/usr/bin/env bun
/**
 * REAL, headless, non-faked eval for the fine-tuned VibeThinker-3B Gmail agent.
 *
 * NOTE: the AUTHORITATIVE headless gate is training/eval-real-mlx.py (direct MLX,
 * proven to apply the LoRA). `mlx_lm.server --adapter-path` in 0.31.3 does NOT
 * apply the adapter (it serves the base model), so this HTTP variant only gives a
 * true tuned score against a backend that actually serves the adapter (e.g. vLLM
 * with the LoRA, or a fused checkpoint). Kept as the served-model integration path.
 *
 * This hits an OpenAI-compatible server that serves the ACTUAL fine-tune
 * (base model + LoRA adapter) and scores the model's real tool-plan output.
 * There is NO target replay: the target plans are used ONLY to grade the
 * model's own generations. If the model doesn't produce them, it fails.
 *
 * Serve the fine-tune first (from ~/bbverifier, which has the MLX env + adapter):
 *   ~/bbverifier/.venv/bin/python -m mlx_lm server \
 *       --model WeiboAI/VibeThinker-3B \
 *       --adapter-path ~/bbverifier/adapters/gmail-agent --port 8000
 * Then, in another shell:
 *   cd ~/accountbox-reset-v4 && bun eval/run-gmail-agent-eval.ts
 *
 * Baseline (prove the adapter matters): restart the server WITHOUT --adapter-path
 * (same model id) and re-run — the base model should FAIL this bar.
 *
 * The `model` field must be the repo id the server loaded (the adapter is already
 * applied server-side via --adapter-path); mlx_lm treats an unknown id as a HF repo.
 *
 * Exit codes:  0 = pass   1 = model failed the bar   2 = server unreachable.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.OPENAI_BASE_URL || "http://127.0.0.1:8000/v1";
const MODEL = process.env.EVAL_MODEL || "WeiboAI/VibeThinker-3B";
const PASS_RATIO = Number(process.env.EVAL_PASS_RATIO || "0.8");
const ALLOWED = new Set(["search_messages", "read_message", "create_draft"]);

// Use the EXACT system prompt the model was trained with (from the SFT data),
// so the eval templates messages the same way training did.
const SYSTEM = JSON.parse(
  readFileSync("training/gmail-agent-train.jsonl", "utf8").split("\n").find(Boolean)!,
).messages[0].content as string;

type Plan = { tool?: string; args?: unknown; steps?: { tool: string; args: unknown }[] };

function extractTools(plan: Plan | null): string[] {
  if (!plan) return [];
  if (plan.tool) return [plan.tool];
  if (Array.isArray(plan.steps)) return plan.steps.map((s) => s.tool).filter(Boolean);
  return [];
}

function clean(text: string): string {
  for (const stop of ["<|im_end|>", "<|endoftext|>"]) {
    const i = text.indexOf(stop);
    if (i !== -1) text = text.slice(0, i);
  }
  return text.trim();
}

function parsePlan(text: string): Plan | null {
  const t = clean(text);
  try {
    return JSON.parse(t);
  } catch {}
  for (const line of t.split("\n")) {
    const l = line.trim();
    if (l.startsWith("{") && l.endsWith("}")) {
      try {
        return JSON.parse(l);
      } catch {}
    }
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a !== -1 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {}
  }
  return null;
}

async function callModel(prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 256,
      stop: ["<|im_end|>"],
    }),
  });
  if (!res.ok) throw new Error(`server ${res.status}`);
  const j: any = await res.json();
  const m = j.choices?.[0]?.message ?? {};
  // Reasoning models (VibeThinker) put <think> content in `reasoning`; the plan,
  // if any, is in `content`. Fall back to reasoning so nothing is silently empty.
  return (m.content && m.content.trim()) ? m.content : (m.reasoning ?? "");
}

async function main() {
  const j = JSON.parse(readFileSync("training/gmail-synthetic-prompts.json", "utf8"));
  const examples = j.prompts.map((p: any) => {
    const first = (p.targets || [])[0];
    const expected: string[] = p.expected_tools?.length
      ? p.expected_tools
      : extractTools(first || null);
    return { input: p.prompt as string, expected };
  });

  console.log(`REAL EVAL — serving: ${BASE}  model: ${MODEL}  (${examples.length} held-out prompts)`);
  console.log("---");

  // Fail-closed on server reachability — probe once before scoring.
  try {
    await callModel(examples[0].input);
  } catch (e) {
    console.error(`SERVER UNREACHABLE at ${BASE}: ${(e as Error).message}`);
    console.error("Start it:  ~/bbverifier/.venv/bin/python -m mlx_lm server \\");
    console.error("  --model WeiboAI/VibeThinker-3B --adapter-path ~/bbverifier/adapters/gmail-agent --port 8000");
    process.exit(2);
  }

  let okJson = 0, okTools = 0, okSet = 0;
  for (const ex of examples) {
    const raw = await callModel(ex.input);
    const pred = parsePlan(raw);
    const pt = extractTools(pred);
    const j2 = pred !== null;
    const t = j2 && pt.length > 0 && pt.every((x) => ALLOWED.has(x));
    const s = t && new Set(pt).size === new Set(ex.expected).size && ex.expected.every((x: string) => pt.includes(x));
    okJson += +j2; okTools += +t; okSet += +s;
    console.log(`\nPROMPT: ${ex.input}`);
    console.log(`RAW   : ${clean(raw).slice(0, 300)}`);
    console.log(`TOOLS : pred=${JSON.stringify(pt)} expected=${JSON.stringify(ex.expected)}  json=${j2} allowed=${t} match=${s}`);
  }

  const n = examples.length;
  const need = Math.ceil(PASS_RATIO * n);
  console.log(`\n[eval] model=${MODEL}: validJSON ${okJson}/${n} | allowedTools ${okTools}/${n} | toolsetMatch ${okSet}/${n}  (need ${need})`);

  const pass = okJson === n && okTools === n && okSet >= need;
  if (!pass) {
    console.log("RESULT: FAIL (fail-closed — the served model did not clear the bar).");
    process.exit(1);
  }
  console.log("RESULT: PASS (real model, real generations, scored).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
