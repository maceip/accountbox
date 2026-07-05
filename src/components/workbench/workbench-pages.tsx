import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";

import { AgentChat } from "@/components/agent/agent-chat";
import { CommandCenter } from "@/components/workbench/command-center";
import { EvalRange } from "@/components/workbench/eval-range";
import { SkillsWorkbench } from "@/components/workbench/skills-workbench";
import { SourcesGmailHub } from "@/components/workbench/sources-gmail-hub";
import { TrainingBay } from "@/components/workbench/training-bay";
import { StatusChip } from "@/components/workbench/status-chip";
import { WbPanel, WbCanvas } from "@/components/workbench/workbench-surfaces";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { GMAIL_FOLDER_PATH } from "@/lib/workbench/nav";
import { SOURCES } from "@/lib/sources";
import type { Folder } from "@/lib/folders";
import { cn } from "@/lib/utils";

const FOLDER_LINKS: { folder: Folder; label: string; to: string }[] = [
  { folder: "inbox", label: "Inbox", to: GMAIL_FOLDER_PATH.inbox },
  { folder: "labeled", label: "Labeled", to: GMAIL_FOLDER_PATH.labeled },
  { folder: "sent", label: "Sent", to: GMAIL_FOLDER_PATH.sent },
  { folder: "drafts", label: "Drafts", to: GMAIL_FOLDER_PATH.drafts },
  { folder: "archived", label: "Archived", to: GMAIL_FOLDER_PATH.archived },
  { folder: "spam", label: "Spam", to: GMAIL_FOLDER_PATH.spam },
  { folder: "trash", label: "Trash", to: GMAIL_FOLDER_PATH.trash },
];

export function CommandCenterPage() {
  return <CommandCenter />;
}

export function SkillsPage() {
  return <SkillsWorkbench />;
}

export function TrainingPage() {
  return <TrainingBay />;
}

export function DatasetsPage() {
  return (
    <WbCanvas className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <WbPanel className="p-4">
        <StatusChip kind="info">No traces exported</StatusChip>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Agent traces live in browser OPFS. Export and dataset tooling lands
          here as it ships.
        </p>
      </WbPanel>
    </WbCanvas>
  );
}

export function EvalsPage() {
  return <EvalRange />;
}

export function SourcesPage() {
  return (
    <WbCanvas className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="flex flex-col gap-4">
        {SOURCES.filter((s) => s.id !== "agent").map((source) => {
          const Icon = source.icon;
          return (
            <Frame
              key={source.id}
              spacing="sm"
              className={cn(source.soon && "opacity-60")}
            >
              <FramePanel className="p-4">
              <div className="flex items-center gap-2">
                <Icon className="size-5 shrink-0" />
                <h2 className="text-[14px] font-semibold">{source.label}</h2>
                {source.soon && <StatusChip kind="blocked">Soon</StatusChip>}
              </div>
              {source.connection && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {source.connection.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {source.id === "gmail" && (
                  <>
                    <Button
                      size="sm"
                      render={<Link to="/sources/gmail/hub" />}
                    >
                      Gmail hub
                    </Button>
                    {FOLDER_LINKS.map((link) => (
                      <Button
                        key={link.folder}
                        size="sm"
                        variant="outline"
                        render={<Link to={link.to} />}
                      >
                        {link.label}
                      </Button>
                    ))}
                  </>
                )}
                {source.id === "github" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link to="/pull-requests" />}
                    >
                      Pull requests
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link to="/issues" />}
                    >
                      Issues
                    </Button>
                  </>
                )}
                {source.connection && !source.soon && (
                  <Button
                    size="sm"
                    onClick={() => source.connection?.connect()}
                  >
                    <Plug className="size-3.5" />
                    Connect
                  </Button>
                )}
              </div>
              </FramePanel>
            </Frame>
          );
        })}
      </div>
    </WbCanvas>
  );
}

export function SourcesGmailHubPage() {
  return <SourcesGmailHub />;
}

export function ArtifactsPage() {
  return (
    <WbCanvas className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <WbPanel className="p-4">
        <StatusChip kind="info">No promoted artifacts</StatusChip>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Adapter versions appear after training completes and passes eval.
        </p>
      </WbPanel>
    </WbCanvas>
  );
}

export function RuntimePage() {
  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <AgentChat />
    </div>
  );
}
