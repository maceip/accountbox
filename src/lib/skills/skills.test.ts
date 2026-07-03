import { describe, expect, test } from "bun:test";
import { defineSkill } from "@/lib/runtime/app-skill";
import { isValidToolPlan } from "@/lib/runtime/plan-parse";
import { SKILLS, getSkill } from "./index";
import { GMAIL_SKILL } from "./gmail/skill";

describe("skill manifests", () => {
  test("every skill derives allowedTools from its tool specs", () => {
    for (const s of SKILLS) {
      expect(s.allowedTools).toEqual(s.tools.map((t) => t.name));
      expect(s.tools.length).toBeGreaterThan(0);
    }
  });

  test("gmail manifest declares the trained tool set exactly", () => {
    expect([...GMAIL_SKILL.allowedTools]).toEqual([
      "search_messages",
      "read_message",
      "create_draft",
    ]);
  });

  test("gmail system prompt stays byte-locked to the training bytes", () => {
    // Guard rails for the B3 invariant: length + boundary bytes. The full
    // byte-identity check against train jsonl lives in cross-verify-runtime.
    expect(GMAIL_SKILL.systemPrompt.length).toBe(481);
    expect(
      GMAIL_SKILL.systemPrompt.startsWith("You are the local Gmail agent"),
    ).toBe(true);
    expect(GMAIL_SKILL.systemPrompt.endsWith("BetterBox mail board.")).toBe(
      true,
    );
  });

  test("getSkill resolves by id and fails closed on unknowns", () => {
    expect(getSkill("gmail-agent")).toBe(GMAIL_SKILL);
    expect(getSkill("not-a-skill")).toBeNull();
  });

  test("defineSkill keeps whitelist in lockstep with tools", () => {
    const s = defineSkill({
      id: "x",
      label: "X",
      description: "test",
      systemPrompt: "p",
      adapterUrl: "/adapters/x",
      tools: [
        { name: "a", description: "", args: [] },
        { name: "b", description: "", args: [] },
      ],
    });
    expect([...s.allowedTools]).toEqual(["a", "b"]);
  });

  test("manifest whitelist gates plan validation (fail-closed)", () => {
    const good = { tool: "search_messages", args: { query: "is:unread" } };
    const evil = { tool: "delete_everything", args: {} };
    expect(isValidToolPlan(good, GMAIL_SKILL.allowedTools)).toBe(true);
    expect(isValidToolPlan(evil, GMAIL_SKILL.allowedTools)).toBe(false);
  });
});
