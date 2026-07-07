import type { ReactNode } from "react";
import { ProductionQueue } from "./production-queue";
import { RuntimeTelemetryStrip } from "./runtime-telemetry";
import { SystemInspector } from "./system-inspector";
import { useWorkbenchQueue } from "@/lib/workbench/queue-status";

export function WorkbenchShell({
  children,
  inspector,
}: {
  children: ReactNode;
  inspector?: ReactNode;
}) {
  const queueRows = useWorkbenchQueue();

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        {inspector ?? (
          <SystemInspector className="hidden w-[min(100%,320px)] shrink-0 xl:flex" />
        )}
      </div>
      <div className="wb-queue-tray shrink-0 p-2">
        {queueRows.length === 0 ? (
          <RuntimeTelemetryStrip />
        ) : (
          <ProductionQueue rows={queueRows} />
        )}
      </div>
    </div>
  );
}
