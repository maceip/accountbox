import { CheckIcon, XIcon } from "lucide-react";

import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

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
    <Frame spacing="sm" className={className} data-readiness-bar>
      <FramePanel>
        <FrameHeader className="mb-2 flex-row items-center justify-between gap-2 p-0">
          <FrameTitle className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            readiness
          </FrameTitle>
          <span className="font-mono text-[10px] text-muted-foreground">
            {readyCount}/{items.length}
          </span>
        </FrameHeader>
        <ul className="grid gap-1 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-md px-1 py-0.5"
            >
              {item.ready ? (
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <XIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="text-[12px] font-medium">{item.label}</p>
                {item.detail && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {item.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </FramePanel>
    </Frame>
  );
}
