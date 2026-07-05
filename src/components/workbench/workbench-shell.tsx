import type { ReactNode } from "react";
import { InspectorPanel } from "./inspector-panel";
import { ProductionQueue } from "./production-queue";
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
          <InspectorPanel className="hidden w-[min(100%,320px)] shrink-0 xl:flex" />
        )}
      </div>
      <div className="wb-queue-tray shrink-0 p-2">
        <ProductionQueue
          rows={queueRows}
          emptyLabel="Queue idle — model loads and runs appear here"
        />
      </div>
    </div>
  );
}
