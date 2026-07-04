import { useMemo, useState } from "react";

import { linkGithub } from "@/lib/auth/auth-client";
import type { PullRequest } from "@/lib/github/github-queries";
import {
  githubRowActions,
  openGithubItem,
  usePullRequests,
} from "@/components/integrations/github-data";
import {
  prToItem,
  type IncomingItem,
  type IncomingItemAction,
} from "@/lib/sources/feed";
import { FeedList } from "@/components/workbench/feed-list";
import {
  ConnectState,
  ErrorState,
  FilterSelect,
  GithubFooter,
  PanelSkeleton,
  StatStrip,
} from "@/components/integrations/github-panel";

type FilterId = "all" | "open" | "review" | "approved" | "merged";

const matches = (p: PullRequest, f: FilterId) => {
  if (f === "all") return true;
  if (f === "open") return p.state === "open" || p.state === "draft";
  if (f === "review") return p.awaitsYou;
  if (f === "approved") return p.state === "open" && p.review === "approved";
  if (f === "merged") return p.state === "merged";
  return true;
};

/** GitHub PRs on the generic incoming-items surface (feed rows + action
 *  descriptors), keeping the panel's stat strip and filter. */
export function PullRequestsPage({
  signedIn = false,
  demo = false,
}: {
  signedIn?: boolean;
  /** Landing-page sandbox: render seeded PRs, no API / connect / loading. */
  demo?: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>("open");
  const feed = usePullRequests({ signedIn, demo });
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh data lands.
  const now = useMemo(() => Date.now(), [feed.dataUpdatedAt]);

  if (feed.isLoading) return <PanelSkeleton />;
  if (feed.needsConnect) {
    return (
      <ConnectState
        blurb="Link your GitHub account to AccountBox (no new account, just a sign-in) and your open pull requests show up here — authored and review-requested, with status, CI, and diff size."
        onConnect={linkGithub}
      />
    );
  }
  if (feed.error !== null) {
    return (
      <ErrorState
        title="Couldn’t load pull requests"
        message={feed.error}
        onRetry={feed.refetch}
      />
    );
  }

  const prs = feed.items;
  const nOpen = prs.filter(
    (p) => p.state === "open" || p.state === "draft",
  ).length;
  const nReview = prs.filter((p) => p.awaitsYou).length;
  const nChanges = prs.filter(
    (p) => p.state === "open" && p.review === "changes",
  ).length;
  const nMerged = prs.filter((p) => p.state === "merged").length;
  const rows = prs.filter((p) => matches(p, filter)).map(prToItem);

  const open = (item: IncomingItem): void => openGithubItem(item, demo);
  const actionsFor = (item: IncomingItem): IncomingItemAction[] =>
    githubRowActions(item, demo);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <StatStrip
        segs={[
          { value: nOpen, label: "open" },
          { value: nReview, label: "awaiting", you: true },
          { value: nChanges, label: "changes" },
          { value: nMerged, label: "merged" },
        ]}
      />
      <FilterSelect
        value={filter}
        onChange={setFilter}
        shown={rows.length}
        items={[
          { id: "open", label: "open" },
          { id: "review", label: "review" },
          { id: "approved", label: "approved" },
          { id: "merged", label: "merged" },
          { id: "all", label: "all" },
        ]}
      />
      <div className="flex-1 overflow-y-auto">
        <FeedList
          items={rows}
          now={now}
          emptyLabel="No pull requests match this filter."
          onOpen={open}
          actionsFor={actionsFor}
          footer={rows.length > 0 ? <GithubFooter /> : null}
        />
      </div>
    </div>
  );
}
