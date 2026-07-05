import { describe, expect, test } from "bun:test";
import { githubExecutor } from "./execute.server";

describe("GitHub executor", () => {
  test("local reply drafts do not require a GitHub token", async () => {
    const results = await githubExecutor.execute(
      { headers: new Headers(), userId: "u1" },
      [
        {
          tool: "draft_github_reply",
          args: {
            repo: "maceip/accountbox",
            num: 42,
            body: "Local proposal only.",
          },
        },
      ],
    );

    expect(results).toEqual([
      {
        tool: "draft_github_reply",
        ok: true,
        networkPosted: false,
        repo: "maceip/accountbox",
        num: 42,
        body: "Local proposal only.",
      },
    ]);
  });
});
