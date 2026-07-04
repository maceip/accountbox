import { describe, expect, test } from "bun:test";
import { defineSkill } from "@/lib/runtime/app-skill";
import { isValidToolPlan } from "@/lib/runtime/plan-parse";
import { SKILLS, getSkill } from "./index";
import { GMAIL_SKILL } from "./gmail/skill";
import { GITHUB_SKILL } from "./github/skill";

describe("skill manifests", () => {
  test("ships Gmail and GitHub as the built-in cartridge pair", () => {
    expect(SKILLS.map((s) => s.id)).toEqual(["gmail-agent", "github-agent"]);
  });

  test("every skill derives allowedTools from its tool specs", () => {
    for (const s of SKILLS) {
      expect(s.allowedTools).toEqual(s.tools.map((t) => t.name));
      expect(s.tools.length).toBeGreaterThan(0);
      expect(s.sourceId.length).toBeGreaterThan(0);
      expect(s.testPrompt.length).toBeGreaterThan(10);
      expect(s.trainingSources.length).toBeGreaterThan(0);
      expect(s.evalCases.length).toBeGreaterThan(0);
      for (const evalCase of s.evalCases) {
        expect(evalCase.prompt.length).toBeGreaterThan(10);
        for (const tool of evalCase.expectTools) {
          expect(s.allowedTools).toContain(tool);
        }
      }
    }
  });

  test("trained skills must provide a real adapter URL", () => {
    for (const s of SKILLS) {
      if (s.availability === "trained") {
        expect(s.adapterUrl?.startsWith("/adapters/")).toBe(true);
      } else {
        expect(s.adapterUrl).toBeUndefined();
      }
    }
  });

  test("gmail manifest declares the trained tool set exactly", () => {
    expect([...GMAIL_SKILL.allowedTools]).toEqual([
      "search_messages",
      "read_message",
      "create_draft",
    ]);
    expect(GMAIL_SKILL.sourceId).toBe("gmail");
    expect(GMAIL_SKILL.safeAction).toEqual({
      tool: "create_draft",
      effect: "provider-draft",
      label: "Create Gmail draft",
    });
  });

  test("github manifest is read plus local-draft only", () => {
    expect(GITHUB_SKILL.availability).toBe("needs-training");
    expect([...GITHUB_SKILL.allowedTools]).toEqual([
      "list_pull_requests",
      "list_issues",
      "draft_github_reply",
    ]);
    expect(GITHUB_SKILL.allowedTools).not.toContain("post_comment");
    expect(GITHUB_SKILL.allowedTools).not.toContain("create_issue");
    expect(GITHUB_SKILL.sourceId).toBe("github");
    expect(GITHUB_SKILL.safeAction).toEqual({
      tool: "draft_github_reply",
      effect: "local-only",
      label: "Prepare local GitHub reply draft",
    });
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
      sourceId: "x-source",
      label: "X",
      description: "test",
      availability: "needs-training",
      safeAction: { tool: null, effect: "read-only", label: "Read only" },
      trainingSources: ["tool-schema"],
      evalCases: [
        {
          id: "x-a",
          prompt: "call tool a for this source",
          expectTools: ["a"],
        },
      ],
      testPrompt: "test prompt for x",
      systemPrompt: "p",
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

  test("github whitelist accepts local drafts but rejects network writes", () => {
    const localDraft = {
      tool: "draft_github_reply",
      args: { repo: "maceip/accountbox", num: 7, body: "Looks good." },
    };
    const post = {
      tool: "post_comment",
      args: { repo: "maceip/accountbox", num: 7, body: "Looks good." },
    };
    expect(isValidToolPlan(localDraft, GITHUB_SKILL.allowedTools)).toBe(true);
    expect(isValidToolPlan(post, GITHUB_SKILL.allowedTools)).toBe(false);
  });
});
