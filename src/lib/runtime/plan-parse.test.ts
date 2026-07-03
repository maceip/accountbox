import { test, expect } from "bun:test";
import {
  extractPlanJson,
  isValidToolPlan,
  firstValidPlanObject,
  type ToolPlanStep,
} from "./plan-parse";

// ---- recovers a genuine plan the model produced ----

test("clean single-tool plan", () => {
  const p = extractPlanJson(
    '{"tool":"search_messages","args":{"query":"is:unread"}}',
  ) as ToolPlanStep;
  expect(isValidToolPlan(p)).toBe(true);
  expect(p.tool).toBe("search_messages");
});

test("clean multi-step plan", () => {
  const p = extractPlanJson(
    '{"steps":[{"tool":"search_messages","args":{"query":"x"}},{"tool":"read_message","args":{"id":"1"}}]}',
  ) as { steps: ToolPlanStep[] };
  expect(isValidToolPlan(p)).toBe(true);
  expect(p.steps.length).toBe(2);
});

test("recovers correct plan followed by int4 trailing garbage (real failure shape)", () => {
  // Model emits a complete valid object, then fails to stop. The old
  // indexOf..lastIndexOf parser swallowed the junk and broke JSON.parse.
  const raw =
    '{"tool":"search_messages","args":{"query":"from:manager launch"}} newer_than:7d"} — "to":"manager"}';
  const p = extractPlanJson(raw) as ToolPlanStep;
  expect(isValidToolPlan(p)).toBe(true);
  expect(p.tool).toBe("search_messages");
  expect(p.args.query).toBe("from:manager launch");
});

test("braces inside string values do not break extraction", () => {
  const p = extractPlanJson(
    '{"tool":"create_draft","args":{"to":"a@b.com","subject":"{weird}","body":"} } {"}}',
  ) as ToolPlanStep;
  expect(isValidToolPlan(p)).toBe(true);
  expect(p.args.subject).toBe("{weird}");
});

test("skips a leading non-plan object and finds the real plan after it", () => {
  const raw = '{"note":"thinking"} {"tool":"read_message","args":{"id":"42"}}';
  const p = extractPlanJson(raw) as ToolPlanStep;
  expect(isValidToolPlan(p)).toBe(true);
  expect(p.tool).toBe("read_message");
});

// ---- honesty guards: corrupted output must NOT be "recovered" ----

test("repetition loop is not a valid plan (stays cold)", () => {
  const raw =
    '{"tool":"search_messages","args":{"query":"label:project-x-x","label":"label:project-x-x","body":"label:project-x-x"';
  expect(firstValidPlanObject(raw)).toBeNull();
});

test("unknown tool is rejected", () => {
  expect(isValidToolPlan({ tool: "delete_all", args: {} })).toBe(false);
});

test("smeared / never-closed object is not fabricated into a plan", () => {
  const raw =
    '{"tool":"create_draft","args":{"to":"all-hands incompany.com","subject":"Re: the meeting","body":"Quick status: all-hands inc';
  // No complete balanced object exists → no recovery, no repair.
  expect(firstValidPlanObject(raw)).toBeNull();
});

test("plain prose returns null", () => {
  expect(extractPlanJson("I cannot read unopened emails.")).toBeNull();
});

test("steps with an empty array is not a valid plan", () => {
  expect(isValidToolPlan({ steps: [] })).toBe(false);
});
