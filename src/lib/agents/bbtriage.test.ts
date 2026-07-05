import { test, expect } from "bun:test";
import {
  extractTriageVerdict,
  isValidTriageVerdict,
  BBTRIAGE_DISPOSITIONS,
} from "./bbtriage";

const VERDICT = {
  disposition: "valid_low",
  severity_estimate: "low",
  is_duplicate_risk: true,
  reasoning: "rate limiting on login, common class",
  questions_for_researcher: [],
  confidence: 0.7,
};

// ---- accepts genuine model output ----

test("verdict alone", () => {
  const r = extractTriageVerdict(JSON.stringify(VERDICT));
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.verdict.disposition).toBe("valid_low");
});

test("reasoning prose then verdict on last line (trained format)", () => {
  const text = `This is a CSRF report against web. The body lacks a PoC -> valid_low.\n${JSON.stringify(VERDICT)}`;
  const r = extractTriageVerdict(text);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.verdict.severity_estimate).toBe("low");
});

test("takes the LAST valid object when several JSON objects appear", () => {
  const first = JSON.stringify({ ...VERDICT, disposition: "slop" });
  const last = JSON.stringify({ ...VERDICT, disposition: "valid_impactful" });
  const r = extractTriageVerdict(`${first}\nrevised:\n${last}`);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.verdict.disposition).toBe("valid_impactful");
});

test("braces inside string values do not break the scan", () => {
  const v = { ...VERDICT, reasoning: 'payload was {"x": "{{evil}}"} injected' };
  const r = extractTriageVerdict(`analysis\n${JSON.stringify(v)}`);
  expect(r.ok).toBe(true);
});

// ---- refuses anything else (no fabrication, no repair) ----

test("refuses non-JSON output with the raw text attached", () => {
  const r = extractTriageVerdict("I think this is probably fine tbh");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.raw).toContain("probably fine");
});

test("refuses JSON that is not a verdict", () => {
  const r = extractTriageVerdict('{"tool":"search_messages","args":{}}');
  expect(r.ok).toBe(false);
});

test("refuses an unknown disposition (closed set)", () => {
  const r = extractTriageVerdict(
    JSON.stringify({ ...VERDICT, disposition: "totally_new_label" }),
  );
  expect(r.ok).toBe(false);
});

test("refuses a truncated object (repetition-loop tail)", () => {
  const cut = JSON.stringify(VERDICT).slice(0, 60);
  const r = extractTriageVerdict(`reasoning...\n${cut}`);
  expect(r.ok).toBe(false);
});

test("isValidTriageVerdict enforces required fields", () => {
  expect(isValidTriageVerdict({ disposition: "slop" })).toBe(false);
  expect(
    isValidTriageVerdict({
      disposition: "slop",
      severity_estimate: "none",
      reasoning: "scanner dump",
    }),
  ).toBe(true);
});

test("every trained disposition validates", () => {
  for (const d of BBTRIAGE_DISPOSITIONS) {
    expect(
      isValidTriageVerdict({
        disposition: d,
        severity_estimate: "low",
        reasoning: "x",
      }),
    ).toBe(true);
  }
});
