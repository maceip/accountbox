import {
  FlaskConical,
  GitCompare,
  Play,
  Square,
  FileText,
  Upload,
} from "lucide-react";

import { CommandCard } from "./command-card";
import { WbPageHeader, WbPanel } from "./workbench-surfaces";
import { StatusChip } from "./status-chip";
import { cn } from "@/lib/utils";

const COLS =
  "grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,0.8fr)_4rem_5rem_minmax(0,0.7fr)_minmax(0,0.7fr)_5rem] gap-2 px-3 py-2 font-mono text-[10px] tracking-wide text-ink-muted uppercase";

export function TrainingBay() {
  return (
    <div className="wb-grain min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <WbPageHeader
        kicker="training"
        title="Training Bay"
        description="Proving-ground queue — runs appear when started from a skill loadout."
      />
      <CommandCard
        className="mb-4"
        actions={[
          {
            id: "start",
            label: "Start run",
            icon: Play,
            status: "command",
            onPress: () => {},
            disabled: true,
            disabledReason: "No dataset queued",
          },
          {
            id: "stop",
            label: "Stop",
            icon: Square,
            status: "blocked",
            onPress: () => {},
            disabled: true,
          },
          {
            id: "logs",
            label: "Logs",
            icon: FileText,
            status: "info",
            onPress: () => {},
            disabled: true,
          },
          {
            id: "compare",
            label: "Compare",
            icon: GitCompare,
            status: "info",
            onPress: () => {},
            disabled: true,
          },
          {
            id: "promote",
            label: "Promote",
            icon: FlaskConical,
            status: "ready",
            onPress: () => {},
            disabled: true,
          },
          {
            id: "export",
            label: "Export",
            icon: Upload,
            status: "runtime",
            onPress: () => {},
            disabled: true,
          },
        ]}
      />
      <WbPanel className="overflow-x-auto">
        <div className={cn(COLS, "border-b border-hairline")}>
          <span>Run</span>
          <span>Skill</span>
          <span>Dataset</span>
          <span>N</span>
          <span>Status</span>
          <span>Eval</span>
          <span>Artifact</span>
          <span>Outcome</span>
        </div>
        <div className="px-3 py-8 text-center">
          <StatusChip kind="info">No training runs queued</StatusChip>
          <p className="mt-2 font-mono text-[11px] text-ink-subtle">
            Nothing is faked here — rows appear after a real train starts.
          </p>
        </div>
      </WbPanel>
    </div>
  );
}
