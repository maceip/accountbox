import { useEffect, useMemo, useState } from "react";

import type { QueueRow } from "@/components/workbench/production-queue";
import { SKILLS } from "@/lib/skills";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import {
  getChatStatus,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
} from "@/lib/runtime/chat-runtime";
import { agentModeSkill } from "@/lib/runtime/agent-mode";

/** Live production queue — model downloads only; no fake train/eval rows. */
export function useWorkbenchQueue(): QueueRow[] {
  const [chatStatus, setChatStatus] = useState(getChatStatus());
  const activeSkill = agentModeSkill() ?? SKILLS[0];
  const [skillStatus, setSkillStatus] = useState(() =>
    getSkillRuntime(activeSkill).getAgentStatus(),
  );

  useEffect(() => subscribeChatStatus(setChatStatus), []);
  useEffect(() => {
    const rt = getSkillRuntime(activeSkill);
    setSkillStatus(rt.getAgentStatus());
    return rt.subscribeAgentStatus(setSkillStatus);
  }, [activeSkill]);

  return useMemo(() => {
    const rows: QueueRow[] = [];
    if (chatStatus.state === "loading") {
      rows.push({
        id: "chat-load",
        name: CHAT_MODEL_LABEL,
        kind: "download",
        status: "running",
        progress: chatStatus.progress?.frac,
        detail: "Chat model",
      });
    }
    if (skillStatus.state === "loading") {
      rows.push({
        id: "skill-load",
        name: activeSkill.label,
        kind: "download",
        status: "running",
        progress: skillStatus.progress?.frac,
        detail: "Skill adapter",
      });
    }
    return rows;
  }, [activeSkill.label, chatStatus, skillStatus]);
}
