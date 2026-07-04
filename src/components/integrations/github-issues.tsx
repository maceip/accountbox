import { useMemo, useState } from "react";

import { linkGithub } from "@/lib/auth/auth-client";
import type { GithubIssue } from "@/lib/github/github-queries";
import {
  githubRowActions,
  openGithubItem,
  useGithubIssues,
} from "@/components/integrations/github-data";
import {
  issueToItem,
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

type FilterId = "all" | "assigned" | "opened";

const matches = (i: GithubIssue, f: FilterId) =>
  f === "all" ? true : f === "assigned" ? i.assignedToYou : !i.assignedToYou;

/** GitHub issues on the generic incoming-items surface. */
export function GithubIssuesPage({
  signedIn = false,
  demo = false,
}: {
  signedIn?: boolean;
  /** Demo mode: render seeded issues, no API / connect / loading. */
  demo?: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const feed = useGithubIssues({ signedIn, demo });
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh data lands.
  const now = useMemo(() => Date.now(), [feed.dataUpdatedAt]);

  if (feed.isLoading) return <PanelSkeleton />;
  if (feed.needsConnect) {
    return (
      <ConnectState
        blurb="Link your GitHub account to AccountBox (no new account, just a sign-in) and the issues assigned to you, or that you opened, show up here."
        onConnect={linkGithub}
      />
    );
  }
  if (feed.error !== null) {
    return (
      <ErrorState
        title="Couldn’t load issues"
        message={feed.error}
        onRetry={feed.refetch}
      />
    );
  }

  const issues = feed.items;
  const nAssigned = issues.filter((i) => i.assignedToYou).length;
  const nOpened = issues.length - nAssigned;
  const rows = issues.filter((i) => matches(i, filter)).map(issueToItem);

  const open = (item: IncomingItem): void => openGithubItem(item, demo);
  const actionsFor = (item: IncomingItem): IncomingItemAction[] =>
    githubRowActions(item, demo);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <StatStrip
        segs={[
          { value: nAssigned, label: "assigned to you", you: true },
          { value: nOpened, label: "opened by you" },
        ]}
      />
      <FilterSelect
        value={filter}
        onChange={setFilter}
        shown={rows.length}
        items={[
          { id: "all", label: "all" },
          { id: "assigned", label: "assigned" },
          { id: "opened", label: "opened" },
        ]}
      />
      <div className="flex-1 overflow-y-auto">
        <FeedList
          items={rows}
          now={now}
          emptyLabel="No issues match this filter."
          onOpen={open}
          actionsFor={actionsFor}
          footer={rows.length > 0 ? <GithubFooter /> : null}
        />
      </div>
    </div>
  );
}
