import { Frame, FramePanel } from "@/components/reui/frame";
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
      <Frame variant="ghost" spacing="sm" className={className}>
        <FramePanel className="border-dashed text-center">
          <p className="font-mono text-[11px] text-muted-foreground">
            {emptyLabel}
          </p>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame spacing="sm" className={className} data-production-queue>
      <FramePanel className="overflow-hidden p-0">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
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
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
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
                <td className="hidden px-3 py-2 font-mono text-[10px] text-muted-foreground sm:table-cell">
                  {row.detail ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FramePanel>
    </Frame>
  );
}
