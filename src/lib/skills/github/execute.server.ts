/**
 * GitHub skill executor — second cartridge proof.
 *
 * Reads use the existing GitHub API helpers. The only "write" tool creates a
 * local proposed reply object and explicitly does not post to GitHub.
 */

import {
  fetchGithubIssues,
  fetchPullRequests,
  getGithubToken,
} from "@/lib/github/github.server";
import {
  ExecutorAuthError,
  type ExecuteContext,
  type PlanStep,
  type SkillExecutor,
} from "@/lib/skills/executor-types";
import { createLocalGithubDraft } from "./local-draft";

async function githubToken(ctx: ExecuteContext): Promise<string> {
  const accessToken = await getGithubToken(ctx.headers, ctx.userId);
  if (!accessToken) {
    throw new ExecutorAuthError(
      "No GitHub access token — connect GitHub first",
    );
  }
  return accessToken;
}

async function executeStep(ctx: ExecuteContext, step: PlanStep) {
  switch (step.tool) {
    case "list_pull_requests": {
      const accessToken = await githubToken(ctx);
      const { login, prs } = await fetchPullRequests(accessToken);
      return {
        tool: step.tool,
        ok: true,
        login,
        count: prs.length,
        results: prs.slice(0, 10).map((pr) => ({
          id: pr.id,
          repo: pr.repo,
          num: pr.num,
          title: pr.title,
          state: pr.state,
          review: pr.review,
          awaitsYou: pr.awaitsYou,
          updated: pr.updated,
          url: pr.url,
        })),
      };
    }
    case "list_issues": {
      const accessToken = await githubToken(ctx);
      const { login, issues } = await fetchGithubIssues(accessToken);
      return {
        tool: step.tool,
        ok: true,
        login,
        count: issues.length,
        results: issues.slice(0, 10).map((issue) => ({
          id: issue.id,
          repo: issue.repo,
          num: issue.num,
          title: issue.title,
          state: issue.state,
          assignedToYou: issue.assignedToYou,
          updated: issue.updated,
          url: issue.url,
        })),
      };
    }
    case "draft_github_reply":
      return createLocalGithubDraft(step);
    default:
      throw new Error(`github executor has no handler for tool "${step.tool}"`);
  }
}

export const githubExecutor: SkillExecutor = {
  async execute(ctx: ExecuteContext, steps: PlanStep[]) {
    const results = [];
    for (const step of steps) {
      results.push(await executeStep(ctx, step));
    }
    return results;
  },
};
