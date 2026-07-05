import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";

import { WorkbenchDataGrid } from "./blocks/workbench-data-grid";
import { StatusChip } from "./status-chip";
import { WbCanvas, WbPageHeader, WbSection } from "./workbench-surfaces";

export type EvalResultRow = {
  id: string;
  prompt: string;
  expected: string;
  actual: string;
  jsonValid: boolean;
  cold: boolean;
  policy: string;
  pass: boolean;
  raw: string;
};

const evalColumnHelper = createColumnHelper<EvalResultRow>();

const EVAL_COLUMNS = [
  evalColumnHelper.accessor("prompt", {
    header: "Prompt",
    meta: { headerTitle: "Prompt" },
    cell: ({ getValue }) => (
      <span className="line-clamp-2 font-mono text-[11px]">{getValue()}</span>
    ),
  }),
  evalColumnHelper.accessor("expected", {
    header: "Expected",
    meta: { headerTitle: "Expected" },
    cell: ({ getValue }) => (
      <span className="line-clamp-2 font-mono text-[11px]">{getValue()}</span>
    ),
  }),
  evalColumnHelper.accessor("actual", {
    header: "Actual",
    meta: { headerTitle: "Actual" },
    cell: ({ getValue }) => (
      <span className="line-clamp-2 font-mono text-[11px]">{getValue()}</span>
    ),
  }),
  evalColumnHelper.accessor("jsonValid", {
    header: "JSON",
    meta: { headerTitle: "JSON" },
    cell: ({ getValue }) => (
      <StatusChip kind={getValue() ? "ready" : "blocked"}>
        {getValue() ? "ok" : "bad"}
      </StatusChip>
    ),
  }),
  evalColumnHelper.accessor("cold", {
    header: "Cold",
    meta: { headerTitle: "Cold" },
    cell: ({ getValue }) => (
      <StatusChip kind={getValue() ? "blocked" : "info"}>
        {getValue() ? "cold" : "—"}
      </StatusChip>
    ),
  }),
  evalColumnHelper.accessor("policy", {
    header: "Policy",
    meta: { headerTitle: "Policy" },
    cell: ({ getValue }) => (
      <span className="font-mono text-[10px]">{getValue()}</span>
    ),
  }),
  evalColumnHelper.accessor("pass", {
    header: "Pass",
    meta: { headerTitle: "Pass" },
    cell: ({ getValue }) => (
      <StatusChip kind={getValue() ? "ready" : "blocked"}>
        {getValue() ? "pass" : "fail"}
      </StatusChip>
    ),
  }),
  evalColumnHelper.accessor("raw", {
    header: "Raw",
    meta: { headerTitle: "Raw" },
    cell: ({ getValue }) => (
      <span className="font-mono text-[10px] text-muted-foreground">
        {getValue() ? "view" : "—"}
      </span>
    ),
  }),
];

export function EvalRange() {
  const columns = useMemo(() => EVAL_COLUMNS, []);
  const rows: EvalResultRow[] = [];

  return (
    <WbCanvas className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <WbPageHeader
        kicker="evals"
        title="Eval Range"
        description="Dense eval table — the trust surface for planner output."
      />
      <WbSection label="eval results">
        <WorkbenchDataGrid
          columns={columns}
          data={rows}
          emptyMessage={
            <p className="py-4 font-mono text-[11px] text-muted-foreground">
              No eval runs yet. Eval results appear here after a real eval pass.
            </p>
          }
        />
      </WbSection>
    </WbCanvas>
  );
}
