import { BotIcon, GripVerticalIcon, XIcon } from "lucide-react";

import { useTileDrag } from "@/components/tile-board";
import { AgentChat, AgentStatusDot } from "@/components/agent/agent-chat";
import { Hint } from "@/components/ui/tooltip";

/** The local agent as a first-class board tile — draggable/closable like any
 *  pane, consistent with the tiling metaphor. The chat body is shared with the
 *  mobile sheet (agent-chat.tsx). */
export function AgentPane({
  paneId,
  onClose,
}: {
  paneId: string;
  onClose: () => void;
}) {
  const beginHeaderDrag = useTileDrag();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
      >
        <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
        <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          Local agent
        </span>
        <AgentStatusDot />
        <Hint label="Close panel">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentChat />
      </div>
    </div>
  );
}
