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

// Default whitelist = the Gmail skill's tools (kept as default so existing
// callers/tests are unchanged). Other skills pass their own list explicitly.
export const ALLOWED_TOOLS = [
  "search_messages",
  "read_message",
  "create_draft",
] as const;

export type ToolPlanStep = { tool: string; args: Record<string, unknown> };
export type ToolPlan = ToolPlanStep | { steps: ToolPlanStep[] };

/** True only for a structurally valid single- or multi-step tool plan. */
export function isValidToolPlan(
  p: unknown,
  allowedTools: readonly string[] = ALLOWED_TOOLS,
): p is ToolPlan {
  const isAllowed = (t: unknown) =>
    typeof t === "string" && allowedTools.includes(t);
  if (!p || typeof p !== "object") return false;
  const obj = p as { tool?: unknown; args?: unknown; steps?: unknown };
  if ("tool" in obj)
    return isAllowed(obj.tool) && !!obj.args && typeof obj.args === "object";
  if (Array.isArray(obj.steps)) {
    return (
      obj.steps.length > 0 &&
      obj.steps.every(
        (s: { tool?: unknown; args?: unknown }) =>
          s && isAllowed(s.tool) && !!s.args,
      )
    );
  }
  return false;
}

function tryParse(s: string): unknown {
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
export function firstValidPlanObject(
  text: string,
  allowedTools: readonly string[] = ALLOWED_TOOLS,
): ToolPlan | null {
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
          if (cand && isValidToolPlan(cand, allowedTools)) return cand;
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
export function extractPlanJson(
  text: string,
  allowedTools: readonly string[] = ALLOWED_TOOLS,
): unknown {
  const t = String(text).trim();

  const whole = tryParse(t);
  if (whole && isValidToolPlan(whole, allowedTools)) return whole;

  const scanned = firstValidPlanObject(t, allowedTools);
  if (scanned) return scanned;

  if (whole) return whole; // parseable JSON, just not a valid plan
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a !== -1 && b > a) return tryParse(t.slice(a, b + 1));
  return null;
}
