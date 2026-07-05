import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { GMAIL_FOLDER_PATH } from "@/lib/workbench/nav";
import { linkGoogle } from "@/lib/auth/auth-client";
import {
  WbCanvas,
  WbPageHeader,
  WbPanel,
  WbSection,
  WbTabs,
} from "./workbench-surfaces";
import { StatusChip } from "./status-chip";

const GMAIL_TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "browse", label: "Browse mail" },
  { id: "capture", label: "Capture examples" },
  { id: "schema", label: "Tool schema" },
  { id: "permissions", label: "Permissions" },
  { id: "drafts", label: "Draft execution" },
  { id: "traces", label: "Trace history" },
] as const;

const TOOLS = ["search_messages", "read_message", "create_draft"];

export function SourcesGmailHub() {
  const [tab, setTab] = useState<string>("browse");

  return (
    <WbCanvas className="h-full">
      <WbPageHeader
        kicker="sources → gmail"
        title="Gmail source"
        description="Source browser and admin — not the app homepage."
        className="mx-4 mt-4 md:mx-6"
      />
      <WbTabs tabs={GMAIL_TABS} active={tab} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {tab === "browse" && (
          <WbSection label="browse mail">
            <p className="mb-3 text-[13px] text-ink-subtle">
              Open the tile board to read and compose. Mail lives under Sources,
              not the command center home.
            </p>
            <Button size="sm" render={<Link to={GMAIL_FOLDER_PATH.inbox} />}>
              Open Gmail inbox
            </Button>
          </WbSection>
        )}

        {tab === "accounts" && (
          <WbSection label="accounts">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-medium">Google account</p>
                <p className="font-mono text-[11px] text-ink-subtle">
                  Connect to power search, read, and draft execution
                </p>
              </div>
              <Button size="sm" onClick={() => linkGoogle()}>
                Connect Gmail
              </Button>
            </div>
          </WbSection>
        )}

        {tab === "schema" && (
          <WbSection label="tool schema">
            <ul className="space-y-2">
              {TOOLS.map((tool) => (
                <li key={tool}>
                  <WbPanel raised className="px-3 py-2 font-mono text-[12px]">
                    {tool}
                  </WbPanel>
                </li>
              ))}
            </ul>
          </WbSection>
        )}

        {tab === "capture" && (
          <WbSection label="capture">
            <StatusChip kind="info">No examples captured</StatusChip>
            <p className="mt-2 text-[13px] text-ink-subtle">
              Record traces from real equipped runs — OPFS only.
            </p>
          </WbSection>
        )}

        {tab === "permissions" && (
          <WbSection label="permissions">
            <p className="font-mono text-[12px] text-ink-subtle">
              gmail.readonly · gmail.compose · OAuth via Better Auth
            </p>
          </WbSection>
        )}

        {tab === "drafts" && (
          <WbSection label="draft execution">
            <p className="text-[13px] text-ink-subtle">
              First write path:{" "}
              <span className="font-mono">create_draft</span> only. Send is not
              available.
            </p>
          </WbSection>
        )}

        {tab === "traces" && (
          <WbSection label="trace history">
            <StatusChip kind="info">No traces exported</StatusChip>
            <p className="mt-2 text-[13px] text-ink-subtle">
              Agent traces live in browser OPFS.
            </p>
          </WbSection>
        )}
      </div>
    </WbCanvas>
  );
}
