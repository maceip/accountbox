/**
 * Build the in-browser bbtriage training subset.
 *
 * Reads the REAL bbtriage SFT splits (data/bbtriage/sft_v1 — the in-repo copy
 * of the data behind macmacmacmac/VibeThinker-3B-BugBounty-Triage,
 * re-materializable via `bun run fetch:models`), tokenizes each
 * example with the REAL VibeThinker tokenizer + chat template (identical to
 * TrainingController.prepareExample), and keeps examples that fit the
 * browser trainer's 1024-token cap without truncation. Writes deterministic
 * subsets to public/datasets/bbtriage/{train,valid}.jsonl.
 *
 * This is a demo-scale subset for the in-browser train/eval loop — the full
 * 17k-run happened offline. No examples are modified; unfit ones are simply
 * not selected. Idempotent: re-running produces identical files.
 *
 * Usage: bun run scripts/make-bbtriage-web-dataset.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PreTrainedTokenizer } from "@huggingface/transformers";

const SRC = join(process.cwd(), "data/bbtriage/sft_v1");
const OUT = join(process.cwd(), "public/datasets/bbtriage");
const MODEL_DIR = join(process.cwd(), "model");
const MAX_TRAIN_SEQ = 1024;
const TRAIN_COUNT = 64;
const VALID_COUNT = 16;

type Msg = { role: string; content: string };
type Example = { messages: Msg[] };

function loadTokenizer(): PreTrainedTokenizer {
  const tj = JSON.parse(readFileSync(join(MODEL_DIR, "tokenizer.json"), "utf8"));
  const tc = JSON.parse(
    readFileSync(join(MODEL_DIR, "tokenizer_config.json"), "utf8"),
  );
  return new PreTrainedTokenizer(tj, tc);
}

// Mirrors emberglass prompt_formatter.formatMessages + prepareExample token math.
function fits(tok: PreTrainedTokenizer, ex: Example): boolean {
  const completion =
    ex.messages.find((m) => m.role === "assistant")?.content ?? "";
  const promptMessages = ex.messages.filter((m) => m.role !== "assistant");
  if (!completion || !promptMessages.length) return false;
  const promptText = tok.apply_chat_template(promptMessages, {
    tokenize: false,
    add_generation_prompt: true,
  }) as string;
  const promptIds = tok.encode(promptText);
  const compIds = tok.encode(completion, { add_special_tokens: false });
  return promptIds.length + compIds.length + 1 <= MAX_TRAIN_SEQ;
}

function select(
  tok: PreTrainedTokenizer,
  path: string,
  count: number,
): string[] {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim());
  const out: string[] = [];
  for (const line of lines) {
    // First-N-that-fit in file order: deterministic, no length re-sorting bias
    // beyond the hard cap itself.
    const ex = JSON.parse(line) as Example;
    if (!fits(tok, ex)) continue;
    out.push(line.trim());
    if (out.length >= count) break;
  }
  if (out.length < count)
    throw new Error(`only ${out.length}/${count} examples fit ${path}`);
  return out;
}

const tok = loadTokenizer();
mkdirSync(OUT, { recursive: true });
const train = select(tok, join(SRC, "train.jsonl"), TRAIN_COUNT);
const valid = select(tok, join(SRC, "valid.jsonl"), VALID_COUNT);
writeFileSync(join(OUT, "train.jsonl"), `${train.join("\n")}\n`);
writeFileSync(join(OUT, "valid.jsonl"), `${valid.join("\n")}\n`);
console.log(
  `wrote ${train.length} train + ${valid.length} valid examples (<= ${MAX_TRAIN_SEQ} tokens) to ${OUT}`,
);
