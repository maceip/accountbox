import { StatusChip } from "./status-chip";

export type AfterActionReportProps = {
  summary: string;
  toolsRun: string[];
  refused: string[];
  traceRecorded: boolean;
  artifactChanged: boolean;
  recommendation?: string;
};

export function AfterActionReport({
  summary,
  toolsRun,
  refused,
  traceRecorded,
  artifactChanged,
  recommendation,
}: AfterActionReportProps) {
  return (
    <div
      className="space-y-3 rounded-lg border border-hairline bg-surface-1 p-4"
      data-after-action-report
    >
      <p className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
        after action report
      </p>
      <p className="text-[13px] text-ink">{summary}</p>
      <dl className="grid gap-2 text-[12px]">
        <div>
          <dt className="font-mono text-[10px] text-ink-subtle">Tools run</dt>
          <dd className="font-mono text-[11px]">
            {toolsRun.length ? toolsRun.join(" · ") : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] text-ink-subtle">Refused</dt>
          <dd className="font-mono text-[11px]">
            {refused.length ? refused.join(" · ") : "—"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <StatusChip kind={traceRecorded ? "ready" : "warning"}>
          trace {traceRecorded ? "recorded" : "skipped"}
        </StatusChip>
        <StatusChip kind={artifactChanged ? "runtime" : "info"}>
          artifact {artifactChanged ? "updated" : "unchanged"}
        </StatusChip>
      </div>
      {recommendation && (
        <p className="border-t border-hairline pt-2 font-mono text-[11px] text-runtime">
          Next: {recommendation}
        </p>
      )}
    </div>
  );
}
