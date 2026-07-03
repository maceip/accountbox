import { MailOpenIcon, MailPlusIcon, PencilIcon } from "lucide-react";

import { READER_PANE_ID } from "@/lib/layout-tree";
import { SOURCE_PANELS } from "@/lib/sources";
import { AccountDot } from "@/components/shell/account-dot";
import { panelKeyOf, type PaneRenderCtx, type PaneType } from "./tiles-context";
import { AccountPane } from "./panes/account-pane";
import { ReaderPane } from "./panes/reader-pane";
import { ComposePaneTile } from "./panes/compose-pane";
import { PullRequestsPane } from "./panes/pull-requests-pane";
import { GithubIssuesPane } from "./panes/github-issues-pane";
import { AgentPane } from "./panes/agent-pane";
import { LoadoutPane } from "@/components/workbench/loadout-pane";
import { ConnectGmailPrompt } from "./connect-gmail-prompt";

type PanelRender = (paneId: string, ctx: PaneRenderCtx) => React.ReactNode;

/** Panel key -> component. Which panels EXIST (titles, icons, which source
 *  owns them) is the registry's call; this file only maps keys to React. */
const PANEL_COMPONENTS: Record<string, PanelRender> = {
  "pull-requests": (paneId, ctx) => (
    <PullRequestsPane paneId={paneId} onClose={() => ctx.onClosePanel(paneId)} />
  ),
  "github-issues": (paneId, ctx) => (
    <GithubIssuesPane paneId={paneId} onClose={() => ctx.onClosePanel(paneId)} />
  ),
  "local-agent": (paneId, ctx) => (
    <AgentPane paneId={paneId} onClose={() => ctx.onClosePanel(paneId)} />
  ),
  loadout: (paneId, ctx) => (
    <LoadoutPane paneId={paneId} onClose={() => ctx.onClosePanel(paneId)} />
  ),
};

type PanelEntry = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  render: PanelRender;
};

const PANEL_REGISTRY: Record<string, PanelEntry> = Object.fromEntries(
  SOURCE_PANELS.filter((p) => PANEL_COMPONENTS[p.key]).map((p) => [
    p.key,
    { title: p.title, icon: p.icon, render: PANEL_COMPONENTS[p.key] },
  ]),
);

type PaneTypeEntry = {
  render: (paneId: string, ctx: PaneRenderCtx) => React.ReactNode;
  dragLabel: (paneId: string, ctx: PaneRenderCtx) => React.ReactNode;
};

export const PANE_TYPES: Record<PaneType, PaneTypeEntry> = {
  email: {
    render: (paneId) => <AccountPane accountId={paneId} />,
    dragLabel: (paneId, ctx) => {
      const account = ctx.accounts.find((a) => a.accountId === paneId);
      if (!account) return null;
      return (
        <>
          <AccountDot
            colorIndex={ctx.accounts.indexOf(account)}
            accountId={account.accountId}
          />
          <span className="font-mono text-xs">{account.email}</span>
        </>
      );
    },
  },
  reader: {
    render: (paneId, ctx) => {
      // Shared reader (one at a time) only survives while a message is open.
      if (paneId === READER_PANE_ID) {
        if (!ctx.reading) return null;
        const acc = ctx.reading.accountId;
        return (
          <ReaderPane
            paneId={paneId}
            accountId={acc}
            emailId={ctx.reading.emailId}
            onClose={() => ctx.closeReaderFor(acc)}
          />
        );
      }
      // Per-account split reader: id is `${READER_PANE_ID}:${accountId}`.
      const acc = paneId.slice(READER_PANE_ID.length + 1);
      return (
        <ReaderPane
          paneId={paneId}
          accountId={acc}
          emailId={ctx.openEmails[acc] ?? null}
          onClose={() => ctx.closeReaderFor(acc)}
        />
      );
    },
    dragLabel: () => (
      <>
        <MailOpenIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs">Reading pane</span>
      </>
    ),
  },
  composer: {
    render: (_paneId, ctx) =>
      ctx.compose ? (
        <ComposePaneTile compose={ctx.compose} accounts={ctx.accounts} />
      ) : null,
    dragLabel: () => (
      <>
        <PencilIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs">New message</span>
      </>
    ),
  },
  panel: {
    render: (paneId, ctx) =>
      PANEL_REGISTRY[panelKeyOf(paneId)]?.render(paneId, ctx) ?? null,
    dragLabel: (paneId) => {
      const entry = PANEL_REGISTRY[panelKeyOf(paneId)];
      if (!entry) return null;
      const Icon = entry.icon;
      return (
        <>
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-xs">{entry.title}</span>
        </>
      );
    },
  },
  connect: {
    render: () => <ConnectGmailPrompt />,
    dragLabel: () => (
      <>
        <MailPlusIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs">Connect Gmail</span>
      </>
    ),
  },
};
