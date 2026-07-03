import { useMemo, useState } from "react";
import { toast } from "sonner";

import { linkGithub } from "@/lib/auth/auth-client";
import {
  useGithubIssuesQuery,
  type GithubIssue,
} from "@/lib/github/github-queries";
import { GithubMark } from "@/components/integrations/github-mark";
import demoIssues from "@/data/demo-issues.json";
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
  const query = useGithubIssuesQuery(signedIn && !demo);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh data lands.
  const now = useMemo(() => Date.now(), [query.dataUpdatedAt]);
  const demoIssueList = useMemo(() => (demo ? makeDemoIssues() : []), [demo]);

  if (!demo) {
    if (query.isLoading) return <PanelSkeleton />;
    if (query.data && !query.data.linked) {
      return (
        <ConnectState
          blurb="Link your GitHub account to AccountBox (no new account, just a sign-in) and the issues assigned to you, or that you opened, show up here."
          onConnect={linkGithub}
        />
      );
    }
    if (query.isError || query.data?.error) {
      return (
        <ErrorState
          title="Couldn’t load issues"
          message={query.data?.error ?? String(query.error)}
          onRetry={() => query.refetch()}
        />
      );
    }
  }

  const issues = demo ? demoIssueList : (query.data?.issues ?? []);
  const nAssigned = issues.filter((i) => i.assignedToYou).length;
  const nOpened = issues.length - nAssigned;
  const rows = issues.filter((i) => matches(i, filter)).map(issueToItem);

  const sealedToast = (item: IncomingItem) =>
    toast("Opens on GitHub", {
      icon: <GithubMark className="size-4" />,
      description: `In the live app, ${item.from} opens on github.com — sealed in this demo.`,
    });
  const open = (item: IncomingItem): void => {
    if (demo || !item.url || item.url === "#") {
      sealedToast(item);
      return;
    }
    window.open(item.url, "_blank", "noopener,noreferrer");
  };
  const actionsFor = (item: IncomingItem): IncomingItemAction[] => [
    { id: "open", label: "Open on GitHub", run: () => open(item) },
    {
      id: "copy-link",
      label: "Copy link",
      run: async () => {
        await navigator.clipboard.writeText(item.url ?? "");
        toast("Copied link");
      },
    },
  ];

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
