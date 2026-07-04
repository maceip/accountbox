import { Button } from "@/components/ui/button";
import { StatusChip } from "./status-chip";

export type MissionBriefingProps = {
  request: string;
  skillLabel: string;
  sourceLabel: string;
  proposedTools: string[];
  policyVerdict: "allowed" | "refused" | "cold";
  riskLevel: "low" | "medium" | "high";
  sideEffect: string;
  onApprove?: () => void;
  onRefuse?: () => void;
  onDryRun?: () => void;
  busy?: boolean;
};

export function MissionBriefing({
  request,
  skillLabel,
  sourceLabel,
  proposedTools,
  policyVerdict,
  riskLevel,
  sideEffect,
  onApprove,
  onRefuse,
  onDryRun,
  busy,
}: MissionBriefingProps) {
  const verdictKind =
    policyVerdict === "allowed"
      ? "ready"
      : policyVerdict === "cold"
        ? "warning"
        : "blocked";

  return (
    <div
      className="space-y-3 rounded-lg border border-hairline bg-surface-1 p-4"
      data-mission-briefing
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
          mission briefing
        </p>
        <StatusChip kind={verdictKind}>{policyVerdict}</StatusChip>
      </div>
      <dl className="grid gap-2 text-[12px]">
        <div>
          <dt className="font-mono text-[10px] text-ink-subtle">Request</dt>
          <dd className="mt-0.5 text-ink">{request}</dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <dt className="font-mono text-[10px] text-ink-subtle">Skill</dt>
            <dd>{skillLabel}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] text-ink-subtle">Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
        </div>
        <div>
          <dt className="font-mono text-[10px] text-ink-subtle">
            Proposed tools
          </dt>
          <dd className="mt-0.5 font-mono text-[11px]">
            {proposedTools.length ? proposedTools.join(" · ") : "—"}
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <dt className="font-mono text-[10px] text-ink-subtle">Risk</dt>
            <dd>{riskLevel}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] text-ink-subtle">
              Side effect
            </dt>
            <dd>{sideEffect}</dd>
          </div>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || policyVerdict !== "allowed"} onClick={onApprove}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onRefuse}>
          Refuse
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDryRun}>
          Dry run
        </Button>
      </div>
    </div>
  );
}
