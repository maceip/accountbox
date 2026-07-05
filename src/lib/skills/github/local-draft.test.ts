import { describe, expect, test } from "bun:test";
import { createLocalGithubDraft } from "./local-draft";

describe("GitHub local draft tool", () => {
  test("creates an approval draft without posting to GitHub", () => {
    const draft = createLocalGithubDraft({
      tool: "draft_github_reply",
      args: {
        repo: "maceip/accountbox",
        num: 42,
        body: "I checked the diff and left a suggested path.",
      },
    });

    expect(draft).toEqual({
      tool: "draft_github_reply",
      ok: true,
      networkPosted: false,
      repo: "maceip/accountbox",
      num: 42,
      body: "I checked the diff and left a suggested path.",
    });
  });

  test("refuses incomplete local drafts", () => {
    expect(() =>
      createLocalGithubDraft({
        tool: "draft_github_reply",
        args: { repo: "maceip/accountbox", num: 42 },
      }),
    ).toThrow("args.body");
  });
});
