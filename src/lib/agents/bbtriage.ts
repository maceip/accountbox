/**
 * bbtriage — the second real cartridge: VibeThinker-3B fine-tuned for bug
 * bounty triage (macmacmacmac/VibeThinker-3B-BugBounty-Triage, trained from
 * the SFT splits now vendored in-repo at data/bbtriage/sft_v1).
 *
 * Unlike Gmail this is not a tool-plan skill: the model reasons about one
 * researcher submission and emits a single JSON disposition object on the
 * last line. So it does NOT go through AppSkill/plan-parse — it runs on the
 * training session (same base weights, LoRA hot-swap) and its output is
 * validated by the honest extractor below: we only accept a complete JSON
 * object the model actually produced; anything else is a refusal carrying
 * the raw text for inspection, never a fabricated triage.
 *
 * The system prompt is BYTE-LOCKED to the training data (same rule as
 * AppSkill.systemPrompt) — it ships in the dataset files and is read from
 * there, not re-typed here, so drift is impossible.
 */

export const BBTRIAGE_ADAPTER_URL = "/adapters/bbtriage";
export const BBTRIAGE_DATASET = {
  train: "/datasets/bbtriage/train.jsonl",
  heldout: "/datasets/bbtriage/valid.jsonl",
} as const;

export const BBTRIAGE_DISPOSITIONS = [
  "valid_impactful",
  "valid_low",
  "corroborated_surge",
  "likely_duplicate",
  "out_of_scope",
  "theoretical_no_poc",
  "self_inflicted",
  "accepted_risk",
  "slop",
] as const;

export type BbtriageDisposition = (typeof BBTRIAGE_DISPOSITIONS)[number];

export interface TriageVerdict {
  disposition: BbtriageDisposition;
  severity_estimate: string;
  reasoning: string;
  confidence?: number;
}

export type TriageResult =
  | { ok: true; verdict: TriageVerdict; raw: string }
  | { ok: false; raw: string; error: string };

/** True only for a structurally valid triage verdict (closed disposition set). */
export function isValidTriageVerdict(v: unknown): v is TriageVerdict {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.disposition === "string" &&
    (BBTRIAGE_DISPOSITIONS as readonly string[]).includes(o.disposition) &&
    typeof o.severity_estimate === "string" &&
    typeof o.reasoning === "string"
  );
}

/**
 * Extract the LAST complete balanced JSON object that validates as a triage
 * verdict (the model is trained to put the verdict on the last line, after
 * its reasoning). String/escape aware; never repairs or fabricates.
 */
export function extractTriageVerdict(text: string): TriageResult {
  const t = String(text);
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  let found: TriageVerdict | null = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const cand = JSON.parse(t.slice(start, i + 1)) as unknown;
            if (isValidTriageVerdict(cand)) found = cand; // keep LAST valid
          } catch {
            // not JSON; keep scanning
          }
          start = -1;
        }
      }
    }
  }
  if (found) return { ok: true, verdict: found, raw: t };
  return {
    ok: false,
    raw: t.slice(0, 800),
    error: "model output contained no valid triage verdict",
  };
}
