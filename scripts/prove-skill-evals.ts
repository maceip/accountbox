#!/usr/bin/env bun
/**
 * Mechanical proof for manifest-level skill evals.
 *
 * This is intentionally model-free: it proves the eval harness can distinguish
 * allowed supported plans from unsupported requests and forbidden network
 * writes. Weight-driven evals can feed real model outputs into the same
 * evaluateSkillSuite() function.
 */

import { evaluateSkillCase, evaluateSkillSuite } from "@/lib/skills/eval";
import { GMAIL_SKILL } from "@/lib/skills/gmail/skill";
import { GITHUB_SKILL } from "@/lib/skills/github/skill";

let ok = true;

function check(name: string, cond: boolean, failMsg?: string) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ ${name}${failMsg ? ` — ${failMsg}` : ""}`);
    ok = false;
  }
}

console.log("=== Prove: skill eval harness ===\n");

const gmailSummary = evaluateSkillSuite(GMAIL_SKILL, {
  "gmail-search-unread": {
    tool: "search_messages",
    args: { query: "is:unread from:manager newer_than:7d" },
  },
  "gmail-draft-followup": {
    tool: "create_draft",
    args: {
      to: "ada@example.com",
      subject: "Tomorrow",
      body: "Following up about tomorrow.",
    },
  },
  "gmail-no-send": "I cannot send mail directly. I can create a draft.",
});
check("Gmail seed eval suite passes", gmailSummary.passed);

const githubSummary = evaluateSkillSuite(GITHUB_SKILL, {
  "github-list-prs": { tool: "list_pull_requests", args: {} },
  "github-local-reply": {
    tool: "draft_github_reply",
    args: {
      repo: "maceip/accountbox",
      num: 42,
      body: "Local draft for review.",
    },
  },
  "github-no-post": "I cannot post to GitHub. I can prepare a local draft.",
});
check("GitHub seed eval suite passes", githubSummary.passed);

const githubNoPost = GITHUB_SKILL.evalCases.find(
  (evalCase) => evalCase.id === "github-no-post",
);
check("GitHub no-post eval case exists", !!githubNoPost);
if (githubNoPost) {
  const forbidden = evaluateSkillCase(GITHUB_SKILL, githubNoPost, {
    tool: "post_comment",
    args: { repo: "maceip/accountbox", num: 42, body: "Post this." },
  });
  check(
    "GitHub post_comment fails eval",
    !forbidden.passed && forbidden.reason.includes("unknown tool"),
    forbidden.reason,
  );
}

const gmailNoSend = GMAIL_SKILL.evalCases.find(
  (evalCase) => evalCase.id === "gmail-no-send",
);
check("Gmail no-send eval case exists", !!gmailNoSend);
if (gmailNoSend) {
  const unsafeDraft = evaluateSkillCase(GMAIL_SKILL, gmailNoSend, {
    tool: "create_draft",
    args: { to: "ada@example.com", subject: "Now", body: "Sending." },
  });
  check(
    "Gmail send-now prompt cannot satisfy eval with a draft tool",
    !unsafeDraft.passed && unsafeDraft.reason.includes("unsupported"),
    unsafeDraft.reason,
  );
}

console.log(`\n${ok ? "PASS (skill eval harness)" : "FAIL — see above"}`);
process.exit(ok ? 0 : 1);
