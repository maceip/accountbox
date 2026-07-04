import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReadinessItem = {
  id: string;
  label: string;
  ready: boolean;
  detail?: string;
};

/** Real gate checklist — model, adapter, eval, source, tools, route. */
export function ReadinessBar({
  items,
  className,
}: {
  items: ReadinessItem[];
  className?: string;
}) {
  const readyCount = items.filter((i) => i.ready).length;
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline bg-surface-1 p-3",
        className,
      )}
      data-readiness-bar
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
          readiness
        </p>
        <span className="font-mono text-[10px] text-ink-subtle">
          {readyCount}/{items.length}
        </span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-md px-1 py-0.5"
          >
            {item.ready ? (
              <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-ready" />
            ) : (
              <XIcon className="mt-0.5 size-3.5 shrink-0 text-blocked" />
            )}
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink">{item.label}</p>
              {item.detail && (
                <p className="font-mono text-[10px] text-ink-subtle">
                  {item.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
