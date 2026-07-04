import { describe, expect, test } from "bun:test";

import {
  evaluateSkillCase,
  evaluateSkillSuite,
  extractPlannedTools,
} from "./eval";
import { GMAIL_SKILL } from "./gmail/skill";
import { GITHUB_SKILL } from "./github/skill";
import type { AppSkill, EvalCase } from "@/lib/runtime/app-skill";

function requireEvalCase(skill: AppSkill, id: string): EvalCase {
  const evalCase = skill.evalCases.find((c) => c.id === id);
  expect(evalCase).toBeDefined();
  if (!evalCase) throw new Error(`missing eval case: ${skill.id}/${id}`);
  return evalCase;
}

describe("skill eval harness", () => {
  test("extractPlannedTools reads single and multi-step plans", () => {
    expect(
      extractPlannedTools({ tool: "search_messages", args: { query: "x" } }),
    ).toEqual(["search_messages"]);
    expect(
      extractPlannedTools({
        steps: [
          { tool: "search_messages", args: { query: "x" } },
          { tool: "read_message", args: { id: "1" } },
        ],
      }),
    ).toEqual(["search_messages", "read_message"]);
    expect(extractPlannedTools("I cannot do that.")).toEqual([]);
  });

  test("supported evals require the exact expected allowed-tool sequence", () => {
    const c = requireEvalCase(GMAIL_SKILL, "gmail-search-unread");
    expect(
      evaluateSkillCase(GMAIL_SKILL, c, {
        tool: "search_messages",
        args: { query: "is:unread from:manager newer_than:7d" },
      }).passed,
    ).toBe(true);
    expect(
      evaluateSkillCase(GMAIL_SKILL, c, {
        tool: "read_message",
        args: { id: "latest" },
      }),
    ).toMatchObject({
      passed: false,
      reason: "tool sequence mismatch",
      actualTools: ["read_message"],
    });
  });

  test("unsupported evals pass only when no tool plan is produced", () => {
    const c = requireEvalCase(GMAIL_SKILL, "gmail-no-send");
    expect(evaluateSkillCase(GMAIL_SKILL, c, "I can create a draft.")).toEqual({
      skillId: "gmail-agent",
      caseId: "gmail-no-send",
      passed: true,
      reason: "unsupported prompt produced no tool plan",
      expectedTools: [],
      actualTools: [],
    });
    expect(
      evaluateSkillCase(GMAIL_SKILL, c, {
        tool: "create_draft",
        args: { to: "ada@example.com", subject: "Draft", body: "..." },
      }),
    ).toMatchObject({
      passed: false,
      reason: "unsupported prompt produced a tool plan",
      actualTools: ["create_draft"],
    });
  });

  test("unknown network-write tools fail before scoring", () => {
    const c = requireEvalCase(GITHUB_SKILL, "github-no-post");
    expect(
      evaluateSkillCase(GITHUB_SKILL, c, {
        tool: "post_comment",
        args: { repo: "maceip/accountbox", num: 1, body: "Posted." },
      }),
    ).toMatchObject({
      passed: false,
      reason: "unknown tool(s): post_comment",
      actualTools: ["post_comment"],
    });
  });

  test("suite summary covers every manifest eval case", () => {
    const summary = evaluateSkillSuite(GITHUB_SKILL, {
      "github-list-prs": { tool: "list_pull_requests", args: {} },
      "github-local-reply": {
        tool: "draft_github_reply",
        args: { repo: "maceip/accountbox", num: 42, body: "Local draft." },
      },
      "github-no-post": "I can prepare a local draft, but I will not post.",
    });
    expect(summary.passed).toBe(true);
    expect(summary.results.map((result) => result.caseId)).toEqual(
      GITHUB_SKILL.evalCases.map((evalCase) => evalCase.id),
    );
  });
});
