import { describe, expect, test } from "bun:test";

import { emailToItem, gmailRowActions, issueToItem, prToItem } from "./feed";
import type { GithubIssue, PullRequest } from "@/lib/github/github-queries";

const PR: PullRequest = {
  id: "pr1",
  repo: "maceip/accountbox",
  num: 42,
  title: "Add feed surface",
  branch: "feed",
  base: "main",
  state: "open",
  review: "required",
  awaitsYou: false,
  labels: [{ name: "ui", color: "#fff" }],
  comments: 2,
  additions: 120,
  deletions: 8,
  ci: "passing",
  updated: "2026-07-01T00:00:00Z",
  url: "https://github.com/maceip/accountbox/pull/42",
  author: "you",
};

const ISSUE: GithubIssue = {
  id: "is1",
  repo: "maceip/accountbox",
  num: 7,
  title: "Feed rows truncate",
  state: "open",
  assignedToYou: true,
  labels: [],
  comments: 1,
  updated: "2026-07-01T00:00:00Z",
  url: "https://github.com/maceip/accountbox/issues/7",
  author: "you",
};

describe("incoming-item mappers", () => {
  test("email → item keeps identity, defaults, and strips CATEGORY_ labels", () => {
    const item = emailToItem({
      id: "m1",
      from: "Ada <ada@example.com>",
      subject: "",
      date: "2026-07-01T00:00:00Z",
      labelIds: ["CATEGORY_PROMOTIONS", "receipts"],
    });
    expect(item.source).toBe("gmail");
    expect(item.title).toBe("(no subject)");
    expect(item.unread).toBe(false);
    expect(item.tags).toEqual(["receipts"]);
    expect(item.url).toBeUndefined();
  });

  test("pr → item carries repo#num, diff preview, and external url", () => {
    const item = prToItem(PR);
    expect(item.source).toBe("github");
    expect(item.from).toBe("maceip/accountbox #42");
    expect(item.preview).toContain("feed → main");
    expect(item.preview).toContain("+120 −8");
    expect(item.url).toBe(PR.url);
    expect(item.status?.label).toBe("review");
  });

  test("pr status precedence: merged > awaiting-you > review state", () => {
    expect(prToItem({ ...PR, state: "merged" }).status?.label).toBe("merged");
    const awaiting = prToItem({ ...PR, awaitsYou: true });
    expect(awaiting.status?.tone).toBe("attention");
    expect(awaiting.unread).toBe(true);
    expect(prToItem({ ...PR, review: "approved" }).status?.label).toBe(
      "approved",
    );
  });

  test("issue → item flags assignment as attention/unread", () => {
    const item = issueToItem(ISSUE);
    expect(item.status).toEqual({ label: "assigned", tone: "attention" });
    expect(item.unread).toBe(true);
    expect(item.preview).toBe("1 comment");
    expect(issueToItem({ ...ISSUE, assignedToYou: false }).unread).toBe(false);
  });
});

describe("gmail row actions", () => {
  test("verbs arrive as descriptors with trash isolated as destructive", () => {
    const actions = gmailRowActions({
      email: { id: "m1", from: "a@b.c", subject: "s", date: "" },
      accountId: "acc1",
    });
    expect(actions.map((a) => a.id)).toEqual([
      "mark-read",
      "reply",
      "forward",
      "trash",
      "copy-id",
    ]);
    const trash = actions.find((a) => a.id === "trash");
    expect(trash?.destructive).toBe(true);
    expect(trash?.separatorBefore).toBe(true);
  });
});
