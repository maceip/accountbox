import { AgentChat } from "@/components/agent/agent-chat";
import { WbSectionLabel } from "./workbench-surfaces";

/** Right rail on Command Center — the agent chatbox Stitch kept omitting. */
export function CommandCenterAgentRail() {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-surface-1/30"
      data-command-center-agent
    >
      <div className="shrink-0 border-b border-hairline px-3 py-2">
        <WbSectionLabel>agent</WbSectionLabel>
      </div>
      <div className="min-h-0 flex-1">
        <AgentChat />
      </div>
    </div>
  );
}
