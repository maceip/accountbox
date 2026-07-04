import type { PlanStep } from "@/lib/skills/executor-types";

export type LocalGithubDraft = {
  tool: "draft_github_reply";
  ok: true;
  networkPosted: false;
  repo: string;
  num: number;
  body: string;
};

function stepArg(step: PlanStep, name: string): unknown {
  return step.args?.[name];
}

export function createLocalGithubDraft(step: PlanStep): LocalGithubDraft {
  const repo = String(stepArg(step, "repo") ?? "").trim();
  const numRaw = stepArg(step, "num");
  const num = typeof numRaw === "number" ? numRaw : Number(numRaw);
  const body = String(stepArg(step, "body") ?? "").trim();

  if (!repo) throw new Error("draft_github_reply requires args.repo");
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new Error("draft_github_reply requires a positive integer args.num");
  }
  if (!body) throw new Error("draft_github_reply requires args.body");

  return {
    tool: "draft_github_reply",
    ok: true,
    networkPosted: false,
    repo,
    num,
    body,
  };
}
