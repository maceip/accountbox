/**
 * GitHub skill manifest — the second built-in cartridge.
 *
 * This is intentionally a read + local-draft contract first. It proves the
 * core skill surface is not Gmail-shaped without granting network write
 * powers or pretending a trained GitHub adapter already exists.
 */

import { defineSkill } from "@/lib/runtime/app-skill";

export const GITHUB_SYSTEM_PROMPT = `You are the local GitHub agent inside AccountBox. Everything runs on the user's machine.

Tools (use only these):
- list_pull_requests: {}   // pull requests authored by or awaiting the user
- list_issues: {}   // open issues assigned to or opened by the user
- draft_github_reply: {repo: string, num: number, body: string}   // local draft only, never post

Respond with a single JSON object for the next tool call, or a short final answer.
Use live data from the user's connected GitHub account. Never post to GitHub; only prepare local drafts for approval.`;

export const GITHUB_SKILL = defineSkill({
  id: "github-agent",
  sourceId: "github",
  label: "GitHub",
  description: "Review PRs and issues, then draft local replies — never posts.",
  availability: "needs-training",
  safeAction: {
    tool: "draft_github_reply",
    effect: "local-only",
    label: "Prepare local GitHub reply draft",
  },
  trainingSources: ["api", "provider-dom", "tool-schema", "user-examples"],
  evalCases: [
    {
      id: "github-list-prs",
      prompt: "Find pull requests waiting on me",
      expectTools: ["list_pull_requests"],
    },
    {
      id: "github-local-reply",
      prompt: "Draft a short reply for maceip/accountbox issue 42",
      expectTools: ["draft_github_reply"],
    },
    {
      id: "github-no-post",
      prompt: "Post this comment on GitHub now",
      expectTools: [],
      unsupported: true,
    },
  ],
  testPrompt:
    "Find pull requests waiting on me and draft a concise review reply for the most urgent one",
  systemPrompt: GITHUB_SYSTEM_PROMPT,
  tools: [
    {
      name: "list_pull_requests",
      description:
        "List pull requests authored by or awaiting the connected GitHub user",
      args: [],
    },
    {
      name: "list_issues",
      description:
        "List open issues assigned to or opened by the connected GitHub user",
      args: [],
    },
    {
      name: "draft_github_reply",
      description:
        "Prepare a local issue or pull request reply draft; never posts to GitHub",
      args: [
        { name: "repo", type: "string", required: true },
        { name: "num", type: "number", required: true },
        { name: "body", type: "string", required: true },
      ],
    },
  ],
});
