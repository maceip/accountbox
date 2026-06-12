import { expect, test } from "bun:test";
import { formatCount } from "@/lib/format";

test("formatCount: plain under 1k", () => {
  expect(formatCount(0)).toBe("0");
  expect(formatCount(42)).toBe("42");
  expect(formatCount(999)).toBe("999");
});

test("formatCount: thousands compact to one decimal", () => {
  expect(formatCount(1300)).toBe("1.3k");
  expect(formatCount(20649)).toBe("20.6k");
});

test("formatCount: millions", () => {
  expect(formatCount(1_500_000)).toBe("1.5m");
});
