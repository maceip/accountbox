import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { WorkbenchDataGrid } from "./blocks/workbench-data-grid";
import { StatusChip } from "./status-chip";
import { WbCanvas, WbPageHeader, WbSection } from "./workbench-surfaces";
import { Button } from "@/components/ui/button";
import { SKILLS } from "@/lib/skills";
import { runLiveSkillEval, type LiveEvalRow } from "@/lib/skills/eval-run";

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

function toEvalRow(skillId: string, r: LiveEvalRow): EvalResultRow {
  return {
    id: `${skillId}:${r.caseId}`,
    prompt: r.prompt,
    expected: r.unsupported
      ? "(unsupported — no tools)"
      : r.expectedTools.join(" → ") || "—",
    actual: r.actualTools.join(" → ") || (r.cold ? "cold" : "—"),
    jsonValid: !r.cold && r.actualTools.length > 0,
    cold: r.cold,
    policy: r.reason,
    pass: r.passed,
    raw: r.raw,
  };
}

export function EvalRange() {
  const columns = useMemo(() => EVAL_COLUMNS, []);
  const [rows, setRows] = useState<EvalResultRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(skillId: string) {
    const skill = SKILLS.find((s) => s.id === skillId);
    if (!skill) return;
    setBusy(skillId);
    setNote(null);
    try {
      const outcome = await runLiveSkillEval(skill);
      if (!outcome.ok) {
        setNote(outcome.reason);
        return;
      }
      const mine = outcome.rows.map((r) => toEvalRow(skillId, r));
      setRows((prev) => [
        ...prev.filter((r) => !r.id.startsWith(`${skillId}:`)),
        ...mine,
      ]);
      const passed = mine.filter((r) => r.pass).length;
      setNote(`${skill.label}: ${passed}/${mine.length} seed cases passed.`);
    } catch (e) {
      setNote(`${skill.label} eval error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <WbCanvas className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <WbPageHeader
        kicker="evals"
        title="Eval Range"
        description="Dense eval table — the trust surface for planner output."
      />
      <WbSection label="run seed evals">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {SKILLS.map((skill) => {
            const equippable =
              skill.availability === "trained" && !!skill.adapterUrl;
            return (
              <Button
                key={skill.id}
                size="xs"
                variant="outline"
                disabled={!equippable || busy === skill.id}
                title={
                  equippable
                    ? `Run ${skill.evalCases.length} seed cases against the equipped ${skill.label} planner`
                    : `${skill.label} has no trained adapter yet`
                }
                onClick={() => run(skill.id)}
              >
                {busy === skill.id ? "Running…" : `Run ${skill.label}`}
                {!equippable ? " (untrained)" : ""}
              </Button>
            );
          })}
        </div>
        {note && (
          <p className="mb-2 font-mono text-[11px] text-muted-foreground">
            {note}
          </p>
        )}
      </WbSection>
      <WbSection label="eval results">
        <WorkbenchDataGrid
          columns={columns}
          data={rows}
          emptyMessage={
            <p className="py-4 font-mono text-[11px] text-muted-foreground">
              No eval runs yet. Equip a cartridge, then run its seed evals —
              results are real planner output, never fabricated.
            </p>
          }
        />
      </WbSection>
    </WbCanvas>
  );
}
