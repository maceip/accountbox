import { createColumnHelper } from "@tanstack/react-table";
import {
  FlaskConical,
  GitCompare,
  Play,
  Square,
  FileText,
  Upload,
} from "lucide-react";
import { useMemo } from "react";

import { CommandCard } from "./command-card";
import { WorkbenchDataGrid } from "./blocks/workbench-data-grid";
import { StatusChip } from "./status-chip";
import { StitchDesignBar } from "./stitch-design-bar";
import { WbCanvas, WbPageHeader } from "./workbench-surfaces";

export type TrainingRunRow = {
  id: string;
  run: string;
  skill: string;
  dataset: string;
  sampleCount: number;
  status: "queued" | "running" | "done" | "failed";
  eval: string;
  artifact: string;
  outcome: string;
};

const trainingColumnHelper = createColumnHelper<TrainingRunRow>();

const TRAINING_COLUMNS = [
  trainingColumnHelper.accessor("run", {
    header: "Run",
    meta: { headerTitle: "Run" },
  }),
  trainingColumnHelper.accessor("skill", {
    header: "Skill",
    meta: { headerTitle: "Skill" },
  }),
  trainingColumnHelper.accessor("dataset", {
    header: "Dataset",
    meta: { headerTitle: "Dataset" },
  }),
  trainingColumnHelper.accessor("sampleCount", {
    header: "N",
    meta: { headerTitle: "N" },
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px]">{getValue()}</span>
    ),
  }),
  trainingColumnHelper.accessor("status", {
    header: "Status",
    meta: { headerTitle: "Status" },
    cell: ({ getValue }) => {
      const status = getValue();
      const kind =
        status === "done"
          ? "ready"
          : status === "failed"
            ? "blocked"
            : status === "running"
              ? "runtime"
              : "warning";
      return <StatusChip kind={kind}>{status}</StatusChip>;
    },
  }),
  trainingColumnHelper.accessor("eval", {
    header: "Eval",
    meta: { headerTitle: "Eval" },
  }),
  trainingColumnHelper.accessor("artifact", {
    header: "Artifact",
    meta: { headerTitle: "Artifact" },
  }),
  trainingColumnHelper.accessor("outcome", {
    header: "Outcome",
    meta: { headerTitle: "Outcome" },
  }),
];

export function TrainingBay() {
  const columns = useMemo(() => TRAINING_COLUMNS, []);
  const rows: TrainingRunRow[] = [];

  return (
    <WbCanvas className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
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
      <WorkbenchDataGrid
        columns={columns}
        data={rows}
        emptyMessage={
          <div className="py-4">
            <StatusChip kind="info">No training runs queued</StatusChip>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Nothing is faked here — rows appear after a real train starts.
            </p>
          </div>
        }
      />
      <StitchDesignBar designId="training" className="mt-4" />
    </WbCanvas>
  );
}
