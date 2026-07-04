import { useMemo } from "react";
import { GripVerticalIcon, RefreshCwIcon, RssIcon, XIcon } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/auth/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { isTestAccount } from "@/lib/test-account";
import { useInboxFeeds } from "@/lib/mail-queries";
import type { ThreadRowEmail } from "@/components/mail/thread-row";
import {
  emailToItem,
  gmailRowActions,
  issueToItem,
  mergeIncoming,
  prToItem,
  type IncomingItem,
  type IncomingItemAction,
} from "@/lib/sources/feed";
import {
  githubRowActions,
  openGithubItem,
  useGithubIssues,
  usePullRequests,
} from "@/components/integrations/github-data";
import { PanelSkeleton } from "@/components/integrations/github-panel";
import { FeedList } from "@/components/workbench/feed-list";
import { useTileDrag } from "@/components/tile-board";
import { useTiles } from "@/components/mail/tiles-context";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Incoming — one merged, date-descending feed of everything that arrived:
 * Gmail inbox threads (every account on the board), GitHub pull requests,
 * and GitHub issues, on the generic feed surface. Sources that aren't
 * connected simply contribute nothing; opening a mail row routes into the
 * reader exactly like the mail panes, GitHub rows open on github.com.
 */
export function IncomingPane({
  paneId,
  onClose,
}: {
  paneId: string;
  onClose: () => void;
}) {
  const beginHeaderDrag = useTileDrag();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { demoMode } = useSettings();
  const { accounts, openEmail, portalContainer } = useTiles();

  const prFeed = usePullRequests({ signedIn: !!session, demo: demoMode });
  const issueFeed = useGithubIssues({ signedIn: !!session, demo: demoMode });
  const emailQueries = useInboxFeeds(accounts.map((a) => a.accountId));

  // Which account each mail item belongs to — needed to open the reader and
  // run the Gmail row verbs. Rebuilt per render over the live query data.
  const gmailItems: IncomingItem[] = [];
  const gmailMeta = new Map<
    string,
    { accountId: string; email: ThreadRowEmail }
  >();
  accounts.forEach((account, i) => {
    for (const email of emailQueries[i]?.data ?? []) {
      gmailMeta.set(email.id, { accountId: account.accountId, email });
      gmailItems.push(emailToItem(email));
    }
  });

  const items = mergeIncoming(
    gmailItems,
    prFeed.items.map(prToItem),
    issueFeed.items.map(issueToItem),
  );

  const emailsUpdatedAt = Math.max(
    0,
    ...emailQueries.map((q) => q.dataUpdatedAt),
  );
  const dataStamp = Math.max(
    prFeed.dataUpdatedAt,
    issueFeed.dataUpdatedAt,
    emailsUpdatedAt,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh data lands.
  const now = useMemo(() => Date.now(), [dataStamp]);

  const initialLoading =
    items.length === 0 &&
    (prFeed.isLoading ||
      issueFeed.isLoading ||
      emailQueries.some((q) => q.isLoading));

  const githubOn = demoMode || prFeed.linked || issueFeed.linked;
  const nothingConnected =
    !demoMode &&
    accounts.length === 0 &&
    (prFeed.needsConnect || issueFeed.needsConnect);

  const failures: { label: string; retry: () => void }[] = [];
  if (prFeed.error) {
    failures.push({ label: "pull requests", retry: prFeed.refetch });
  }
  if (issueFeed.error) {
    failures.push({ label: "issues", retry: issueFeed.refetch });
  }
  if (emailQueries.some((q) => q.isError)) {
    failures.push({
      label: "mail",
      retry: () => {
        for (const q of emailQueries) if (q.isError) void q.refetch();
      },
    });
  }

  const live =
    !demoMode &&
    (accounts.some((a) => !isTestAccount(a.accountId)) ||
      prFeed.linked ||
      issueFeed.linked);
  const refreshing =
    useIsFetching({ queryKey: ["emails-incoming"] }) +
      useIsFetching({ queryKey: ["pull-requests"] }) +
      useIsFetching({ queryKey: ["github-issues"] }) >
    0;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["emails-incoming"] });
    queryClient.invalidateQueries({ queryKey: ["pull-requests"] });
    queryClient.invalidateQueries({ queryKey: ["github-issues"] });
  };

  const openItem = (item: IncomingItem): void => {
    if (item.source === "gmail") {
      const meta = gmailMeta.get(item.id);
      if (meta) openEmail(meta.accountId, meta.email.id);
      return;
    }
    openGithubItem(item, demoMode);
  };
  const actionsFor = (item: IncomingItem): IncomingItemAction[] => {
    if (item.source === "gmail") {
      const meta = gmailMeta.get(item.id);
      if (!meta) return [];
      return gmailRowActions({
        email: meta.email,
        accountId: meta.accountId,
        onOpen: () => openEmail(meta.accountId, meta.email.id),
      });
    }
    return githubRowActions(item, demoMode);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
      >
        <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
        <RssIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          Incoming
        </span>
        {live && (
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-success">
            <span className="size-1.5 rounded-full bg-success" />
            live
          </span>
        )}
        {!demoMode && (
          <Hint label="Refresh">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <RefreshCwIcon
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
            </button>
          </Hint>
        )}
        <Hint label="Close panel">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {initialLoading ? (
          <PanelSkeleton />
        ) : (
          <>
            {failures.length > 0 && (
              <div className="flex flex-none items-center gap-2 border-b border-border px-3.5 py-2 font-mono text-[10.5px] text-label-red">
                <span className="min-w-0 truncate">
                  Couldn’t load {failures.map((f) => f.label).join(", ")}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    for (const f of failures) f.retry();
                  }}
                  className="ml-auto shrink-0 cursor-pointer rounded border border-border/70 px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Retry
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <FeedList
                items={items}
                now={now}
                emptyLabel={
                  nothingConnected
                    ? "Nothing connected yet — link Gmail or GitHub and new items land here."
                    : "Nothing incoming."
                }
                onOpen={openItem}
                actionsFor={actionsFor}
                footer={
                  items.length > 0 ? (
                    <IncomingFooter
                      gmail={accounts.length > 0}
                      github={githubOn}
                    />
                  ) : null
                }
                portalContainer={portalContainer}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IncomingFooter({
  gmail,
  github,
}: {
  gmail: boolean;
  github: boolean;
}) {
  const sources = [gmail ? "Gmail" : null, github ? "the GitHub API" : null]
    .filter(Boolean)
    .join(" and ");
  return (
    <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/60">
      live from {sources}
    </div>
  );
}
