import { test, expect } from "bun:test";
import { parseJsonlExamples } from "./sft-data";

test("parses well-formed JSONL and skips blanks", () => {
  const text = [
    '{"messages":[{"role":"system","content":"s"},{"role":"user","content":"u"},{"role":"assistant","content":"a"}]}',
    "",
    '{"messages":[{"role":"user","content":"u2"},{"role":"assistant","content":"a2"}]}',
  ].join("\n");
  const out = parseJsonlExamples(text);
  expect(out.length).toBe(2);
  expect(out[0].messages[0].role).toBe("system");
});

test("skips malformed lines without throwing", () => {
  const text = [
    "{not json",
    '{"messages":[{"role":"user","content":"u"},{"role":"assistant","content":"a"}]}',
  ].join("\n");
  expect(parseJsonlExamples(text).length).toBe(1);
});

test("skips objects with fewer than two messages", () => {
  const text = '{"messages":[{"role":"user","content":"u"}]}';
  expect(parseJsonlExamples(text).length).toBe(0);
});

test("empty input yields no examples", () => {
  expect(parseJsonlExamples("").length).toBe(0);
  expect(parseJsonlExamples("\n\n").length).toBe(0);
});
