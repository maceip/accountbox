import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { GMAIL_FOLDER_PATH } from "@/lib/workbench/nav";
import { linkGoogle } from "@/lib/auth/auth-client";
import { WbPanel, WbSectionLabel, WbTabs, WbCanvas } from "./workbench-surfaces";
import { StatusChip } from "./status-chip";
import { StitchDesignBar } from "./stitch-design-bar";

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
      <div className="shrink-0 border-b border-hairline px-4 py-3">
        <p className="font-mono text-[10px] text-ink-muted uppercase">
          Sources → Gmail
        </p>
        <h1 className="text-lg font-semibold">Gmail source</h1>
        <p className="mt-0.5 text-[13px] text-ink-subtle">
          Source browser and admin — not the app homepage.
        </p>
      </div>
      <WbTabs tabs={GMAIL_TABS} active={tab} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {tab === "browse" && (
          <WbPanel className="p-4">
            <WbSectionLabel className="mb-2">browse mail</WbSectionLabel>
            <p className="mb-3 text-[13px] text-ink-subtle">
              Open the tile board to read and compose. Mail lives under Sources,
              not the command center home.
            </p>
            <Button size="sm" render={<Link to={GMAIL_FOLDER_PATH.inbox} />}>
              Open Gmail inbox
            </Button>
          </WbPanel>
        )}

        {tab === "accounts" && (
          <WbPanel className="p-4">
            <div className="flex items-center justify-between gap-2">
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
          </WbPanel>
        )}

        {tab === "schema" && (
          <WbPanel className="p-4">
            <WbSectionLabel className="mb-2">tool schema</WbSectionLabel>
            <ul className="space-y-2">
              {TOOLS.map((tool) => (
                <li key={tool}>
                  <WbPanel raised className="px-3 py-2 font-mono text-[12px]">
                    {tool}
                  </WbPanel>
                </li>
              ))}
            </ul>
          </WbPanel>
        )}

        {tab === "capture" && (
          <WbPanel className="p-4">
            <StatusChip kind="info">No examples captured</StatusChip>
            <p className="mt-2 text-[13px] text-ink-subtle">
              Record traces from real equipped runs — OPFS only.
            </p>
          </WbPanel>
        )}

        {tab === "permissions" && (
          <WbPanel className="p-4 font-mono text-[12px] text-ink-subtle">
            gmail.readonly · gmail.compose · OAuth via Better Auth
          </WbPanel>
        )}

        {tab === "drafts" && (
          <WbPanel className="p-4 text-[13px] text-ink-subtle">
            First write path: <span className="font-mono">create_draft</span>{" "}
            only. Send is not available.
          </WbPanel>
        )}

        {tab === "traces" && (
          <WbPanel className="p-4">
            <StatusChip kind="info">No traces exported</StatusChip>
            <p className="mt-2 text-[13px] text-ink-subtle">
              Agent traces live in browser OPFS.
            </p>
          </WbPanel>
        )}
      </div>
      <StitchDesignBar designId="sources-gmail" className="mx-4 mb-4 md:mx-6" />
    </WbCanvas>
  );
}
