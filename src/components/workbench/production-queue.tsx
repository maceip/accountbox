import { cn } from "@/lib/utils";
import { StatusChip, type StatusKind } from "./status-chip";

export type QueueRow = {
  id: string;
  name: string;
  kind: "download" | "train" | "eval" | "export" | "promote";
  status: "queued" | "running" | "done" | "failed";
  detail?: string;
  progress?: number;
};

const STATUS_KIND: Record<QueueRow["status"], StatusKind> = {
  queued: "warning",
  running: "runtime",
  done: "ready",
  failed: "blocked",
};

export function ProductionQueue({
  rows,
  className,
  emptyLabel = "No jobs queued",
}: {
  rows: QueueRow[];
  className?: string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-hairline px-3 py-4 text-center",
          className,
        )}
      >
        <p className="font-mono text-[11px] text-ink-subtle">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-hairline bg-surface-1",
        className,
      )}
      data-production-queue
    >
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-hairline font-mono text-[10px] tracking-wide text-ink-muted uppercase">
            <th className="px-3 py-2 font-medium">Job</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-hairline last:border-0">
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-ink-subtle">
                {row.kind}
              </td>
              <td className="px-3 py-2">
                <StatusChip kind={STATUS_KIND[row.status]}>
                  {row.status}
                  {row.progress != null && row.status === "running"
                    ? ` ${Math.round(row.progress * 100)}%`
                    : ""}
                </StatusChip>
              </td>
              <td className="hidden px-3 py-2 font-mono text-[10px] text-ink-subtle sm:table-cell">
                {row.detail ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
