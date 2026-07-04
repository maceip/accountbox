import { cn } from "@/lib/utils";
import { WbPageHeader, WbPanel } from "./workbench-surfaces";

const COLS =
  "grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.65fr)_minmax(0,0.65fr)_3.5rem_3.5rem_minmax(0,0.55fr)_4rem_minmax(0,0.5fr)] gap-2 px-3 py-2 font-mono text-[10px] tracking-wide text-ink-muted uppercase";

export function EvalRange() {
  return (
    <div className="wb-grain min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <WbPageHeader
        kicker="evals"
        title="Eval Range"
        description="Dense eval table — the trust surface for planner output."
      />
      <WbPanel className="overflow-x-auto">
        <div className={cn(COLS, "border-b border-hairline")}>
          <span>Prompt</span>
          <span>Expected</span>
          <span>Actual</span>
          <span>JSON</span>
          <span>Cold</span>
          <span>Policy</span>
          <span>Pass</span>
          <span>Raw</span>
        </div>
        <p className="px-3 py-8 text-center font-mono text-[11px] text-ink-subtle">
          No eval runs yet. Eval results appear here after a real eval pass.
        </p>
      </WbPanel>
    </div>
  );
}
