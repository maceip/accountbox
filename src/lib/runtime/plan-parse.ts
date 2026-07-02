/**
 * Pure plan-JSON extraction — no engine deps, unit-testable in isolation.
 *
 * HONESTY CONTRACT: this only *finds and extracts* a complete, valid tool plan
 * that the model actually produced. It never fabricates or repairs values. If
 * the model's output is genuinely corrupted (repetition loops, smeared fields,
 * an object that never closes) this returns null and the caller tags __cold —
 * a real failure stays a real failure.
 *
 * Why this exists: the browser runs int4-quantized weights, so the model often
 * emits the correct plan and then fails to stop, appending garbage. The old
 * parser used indexOf('{')..lastIndexOf('}'), which swallows that trailing junk
 * and breaks JSON.parse. A string/brace-aware scan recovers the genuine plan.
 */

export const ALLOWED_TOOLS = ["search_messages", "read_message", "create_draft"] as const;
type ToolName = (typeof ALLOWED_TOOLS)[number];

function isAllowed(t: unknown): t is ToolName {
  return typeof t === "string" && (ALLOWED_TOOLS as readonly string[]).includes(t);
}

/** True only for a structurally valid single- or multi-step tool plan. */
export function isValidToolPlan(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  if ("tool" in p) return isAllowed(p.tool) && !!p.args && typeof p.args === "object";
  if (Array.isArray(p.steps)) {
    return p.steps.length > 0 && p.steps.every((s: any) => s && isAllowed(s.tool) && !!s.args);
  }
  return false;
}

function tryParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Scan for the FIRST complete, balanced JSON object (string/escape aware) that
 * both parses and is a valid tool plan. Braces inside string literals do not
 * affect nesting depth. Returns null if no complete valid plan object exists.
 */
export function firstValidPlanObject(text: string): any | null {
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
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
          const cand = tryParse(text.slice(start, i + 1));
          if (cand && isValidToolPlan(cand)) return cand;
          start = -1; // not a valid plan; keep scanning for a later object
        }
      }
    }
  }
  return null;
}

/**
 * Best-effort plan extraction from raw model text.
 *  1. whole string, if it's a valid plan
 *  2. first complete balanced object that is a valid plan (recovers plan+junk)
 *  3. any parseable JSON (so the caller can report "JSON but not a plan"
 *     distinctly from "not JSON") — never fabricated.
 */
export function extractPlanJson(text: string): any | null {
  const t = String(text).trim();

  const whole = tryParse(t);
  if (whole && isValidToolPlan(whole)) return whole;

  const scanned = firstValidPlanObject(t);
  if (scanned) return scanned;

  if (whole) return whole; // parseable JSON, just not a valid plan
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a !== -1 && b > a) return tryParse(t.slice(a, b + 1));
  return null;
}
