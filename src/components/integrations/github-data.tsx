import { useMemo } from "react";
import { toast } from "sonner";

import demoIssues from "@/data/demo-issues.json";
import demoPullRequests from "@/data/demo-pull-requests.json";
import {
  useGithubIssuesQuery,
  usePullRequestsQuery,
  type GithubIssue,
  type PullRequest,
} from "@/lib/github/github-queries";
import type { IncomingItem, IncomingItemAction } from "@/lib/sources/feed";
import { GithubMark } from "@/components/integrations/github-mark";

/**
 * GitHub data for feed surfaces: the React Query fetch plus the demo-mode
 * fallback, folded into one state shape so the PR panel, the issues panel,
 * and the merged Incoming feed all render the same connect / loading / error
 * branches. Extracted from the two panels — same signals they read before.
 */

export type GithubFeed<T> = {
  /** Resolved rows — seeded rows in demo mode, live rows otherwise. */
  items: T[];
  /** Live query still on its first load (never in demo). */
  isLoading: boolean;
  /** GitHub isn't linked yet — surfaces show the connect CTA (never in demo). */
  needsConnect: boolean;
  /** True once live data confirms the link (demo counts as not linked). */
  linked: boolean;
  /** Load failure message, if any (never in demo). */
  error: string | null;
  refetch: () => void;
  /** Bumps when fresh data lands — relative-time baselines key off it. */
  dataUpdatedAt: number;
};

type DemoPr = Omit<PullRequest, "url" | "author" | "labels" | "updated"> & {
  minutesAgo: number;
};

function makeDemoPullRequests(): PullRequest[] {
  const now = Date.now();
  return (demoPullRequests as unknown as DemoPr[]).map(
    ({ minutesAgo, ...rec }) => ({
      ...rec,
      labels: [],
      author: "you",
      url: "#",
      updated: new Date(now - minutesAgo * 60_000).toISOString(),
    }),
  );
}

type DemoIssue = Omit<GithubIssue, "url" | "updated" | "author"> & {
  minutesAgo: number;
};

function makeDemoIssues(): GithubIssue[] {
  const now = Date.now();
  return (demoIssues as unknown as DemoIssue[]).map(
    ({ minutesAgo, ...rec }) => ({
      ...rec,
      author: "you",
      url: "#",
      updated: new Date(now - minutesAgo * 60_000).toISOString(),
    }),
  );
}

export function usePullRequests({
  signedIn,
  demo,
}: {
  signedIn: boolean;
  demo: boolean;
}): GithubFeed<PullRequest> {
  const query = usePullRequestsQuery(signedIn && !demo);
  const demoPrs = useMemo(() => (demo ? makeDemoPullRequests() : []), [demo]);
  return {
    items: demo ? demoPrs : (query.data?.prs ?? []),
    isLoading: !demo && query.isLoading,
    needsConnect: !demo && !!query.data && !query.data.linked,
    linked: !demo && (query.data?.linked ?? false),
    error:
      !demo && (query.isError || query.data?.error)
        ? (query.data?.error ?? String(query.error))
        : null,
    refetch: () => void query.refetch(),
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

export function useGithubIssues({
  signedIn,
  demo,
}: {
  signedIn: boolean;
  demo: boolean;
}): GithubFeed<GithubIssue> {
  const query = useGithubIssuesQuery(signedIn && !demo);
  const demoRows = useMemo(() => (demo ? makeDemoIssues() : []), [demo]);
  return {
    items: demo ? demoRows : (query.data?.issues ?? []),
    isLoading: !demo && query.isLoading,
    needsConnect: !demo && !!query.data && !query.data.linked,
    linked: !demo && (query.data?.linked ?? false),
    error:
      !demo && (query.isError || query.data?.error)
        ? (query.data?.error ?? String(query.error))
        : null,
    refetch: () => void query.refetch(),
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

/** Open a GitHub item externally — sealed toast in demo mode, where seeded
 *  rows link nowhere on purpose. */
export function openGithubItem(item: IncomingItem, demo: boolean): void {
  if (demo || !item.url || item.url === "#") {
    toast("Opens on GitHub", {
      icon: <GithubMark className="size-4" />,
      description: `In the live app, ${item.from} opens on github.com — sealed in this demo.`,
    });
    return;
  }
  window.open(item.url, "_blank", "noopener,noreferrer");
}

/** GitHub's row verbs as descriptors — shared by the PR panel, the issues
 *  panel, and the merged Incoming feed. */
export function githubRowActions(
  item: IncomingItem,
  demo: boolean,
): IncomingItemAction[] {
  return [
    {
      id: "open",
      label: "Open on GitHub",
      run: () => openGithubItem(item, demo),
    },
    {
      id: "copy-link",
      label: "Copy link",
      run: async () => {
        await navigator.clipboard.writeText(item.url ?? "");
        toast("Copied link");
      },
    },
  ];
}
