import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Plug, Swords } from "lucide-react";

import { useAccountsQuery } from "@/lib/mail-queries";
import { SKILLS, getSkill } from "@/lib/skills";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import {
  getChatStatus,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
  type ChatStatus,
} from "@/lib/runtime/chat-runtime";
import {
  getPreloadDecision,
  subscribePreloadDecision,
  type PreloadDecision,
} from "@/lib/runtime/agent-preload";
import type { AgentStatus } from "@/lib/runtime/agent-runtime";
import { agentModeSkill, getAgentMode } from "@/lib/runtime/agent-mode";
import { Button } from "@/components/ui/button";
import { ConnectedSourcesBlock } from "./blocks/connected-sources-block";
import { LoadoutSlots, type LoadoutSlot } from "./loadout-slots";
import { ReadinessBar, type ReadinessItem } from "./readiness-bar";
import { StatusChip } from "./status-chip";
import {
  WbBlockerBanner,
  WbCanvas,
  WbPageHeader,
  WbSection,
  WbSectionLabel,
} from "./workbench-surfaces";

function useChatStatus(): ChatStatus {
  const [status, setStatus] = useState<ChatStatus>(getChatStatus());
  useEffect(() => subscribeChatStatus(setStatus), []);
  return status;
}

function usePreloadDecision(): PreloadDecision {
  const [decision, setDecision] =
    useState<PreloadDecision>(getPreloadDecision());
  useEffect(
    () => subscribePreloadDecision(() => setDecision(getPreloadDecision())),
    [],
  );
  return decision;
}

function useSkillStatus(skillId: string): AgentStatus {
  const skill = getSkill(skillId);
  const [status, setStatus] = useState<AgentStatus>(() =>
    skill ? getSkillRuntime(skill).getAgentStatus() : { state: "unloaded" },
  );
  useEffect(() => {
    if (!skill) return;
    const rt = getSkillRuntime(skill);
    setStatus(rt.getAgentStatus());
    return rt.subscribeAgentStatus(setStatus);
  }, [skillId, skill]);
  return status;
}

export function CommandCenter() {
  const { data: accounts } = useAccountsQuery(true);
  const chatStatus = useChatStatus();
  const preload = usePreloadDecision();
  const activeSkill = agentModeSkill() ?? SKILLS[0];
  const skillStatus = useSkillStatus(activeSkill.id);
  const mode = getAgentMode();

  const gmailConnected = (accounts?.length ?? 0) > 0;

  const loadoutSlots: LoadoutSlot[] = useMemo(
    () => [
      {
        id: "base",
        label: "Base",
        detail:
          mode === "chat"
            ? CHAT_MODEL_LABEL
            : "Qwen base",
        state:
          mode === "chat"
            ? chatStatus.state === "ready"
              ? "equipped"
              : chatStatus.state === "loading"
                ? "loading"
                : chatStatus.state === "error"
                  ? "failing"
                  : "empty"
            : skillStatus.state === "loaded" || skillStatus.state === "equipped"
              ? "available"
              : skillStatus.state === "loading"
                ? "loading"
                : "empty",
      },
      {
        id: "adapter",
        label: "Adapter",
        detail: activeSkill.id,
        state:
          skillStatus.state === "equipped"
            ? "equipped"
            : skillStatus.state === "loading"
              ? "loading"
              : skillStatus.state === "error"
                ? "failing"
                : "empty",
      },
      {
        id: "policy",
        label: "Policy",
        detail: "Default",
        state: "available",
      },
      {
        id: "dataset",
        label: "Dataset",
        detail: "—",
        state: "empty",
      },
      {
        id: "source",
        label: "Source",
        detail: gmailConnected ? "Loaded" : "Cold",
        state: gmailConnected ? "passing" : "blocked",
      },
      {
        id: "eval",
        label: "Eval",
        detail: "Nominal",
        state: "empty",
      },
    ],
    [
      activeSkill,
      chatStatus.state,
      gmailConnected,
      mode,
      skillStatus.state,
    ],
  );

  const readiness: ReadinessItem[] = useMemo(
    () => [
      {
        id: "model",
        label: "Neural engine",
        ready:
          chatStatus.state === "ready" ||
          skillStatus.state === "equipped" ||
          skillStatus.state === "loaded",
        detail:
          chatStatus.state === "loading" || skillStatus.state === "loading"
            ? "Streaming…"
            : undefined,
      },
      {
        id: "adapter",
        label: "Adapter present",
        ready: skillStatus.state === "equipped",
      },
      {
        id: "eval",
        label: "Eval passed",
        ready: false,
        detail: "Not run",
      },
      {
        id: "source",
        label: "Source sync",
        ready: gmailConnected,
        detail: gmailConnected ? `${accounts?.length} account(s)` : "Connect Gmail",
        tone: gmailConnected ? undefined : "pending",
      },
      {
        id: "tools",
        label: "Tools whitelisted",
        ready: true,
      },
      {
        id: "route",
        label: "Execution route",
        ready: skillStatus.state === "equipped" && gmailConnected,
        detail: "create_draft only",
        tone:
          skillStatus.state === "equipped" && gmailConnected
            ? undefined
            : "blocked",
      },
    ],
    [accounts?.length, chatStatus.state, gmailConnected, skillStatus.state],
  );

  const blocker = useMemo(() => {
    if (preload === "unsupported")
      return "WebGPU unavailable — runtime blocked on this device.";
    if (!gmailConnected)
      return "Connect Gmail under Sources to enable automated indexing.";
    if (skillStatus.state !== "equipped" && mode !== "chat")
      return "Equip the skill from Skills → Loadout.";
    if (mode === "chat" && chatStatus.state !== "ready")
      return "Load the chat model from Runtime.";
    return null;
  }, [chatStatus.state, gmailConnected, mode, preload, skillStatus.state]);

  return (
    <WbCanvas className="h-full overflow-y-auto p-4 md:p-6">
      <WbPageHeader
        kicker="command center"
        title="Operations base"
        description="What am I training? Is it equipped? Is it passing? What source powers it? What can it safely do?"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" render={<Link to="/skills" />}>
              <Swords className="size-3.5" />
              Skills
            </Button>
            <Button size="sm" variant="outline" render={<Link to="/runtime" />}>
              Runtime
            </Button>
          </div>
        }
      />

      {blocker && (
        <WbBlockerBanner
          className="mb-4"
          action={
            !gmailConnected ? (
              <Button
                size="xs"
                variant="outline"
                className="border-(--color-blocker-border) bg-[#1f1610] font-mono text-[10px] uppercase"
                style={{ color: "var(--color-blocker-ink)" }}
                render={<Link to="/sources" />}
              >
                Sources
              </Button>
            ) : undefined
          }
        >
          {blocker}
        </WbBlockerBanner>
      )}

      <div className="mb-4 flex items-center justify-end gap-2">
        <WbSectionLabel className="mr-auto">cartridge</WbSectionLabel>
        <StatusChip kind="command">{activeSkill.label}</StatusChip>
      </div>

      <LoadoutSlots slots={loadoutSlots} className="mb-4" />

      <ReadinessBar items={readiness} className="mb-4" />

      <ConnectedSourcesBlock
        gmailConnected={gmailConnected}
        accountCount={accounts?.length ?? 0}
      />

      <WbSection label="next action" className="mt-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          render={<Link to="/sources" />}
        >
          <Plug className="size-3.5" />
          Open Sources
          <ArrowRight className="size-3.5" />
        </Button>
      </WbSection>
    </WbCanvas>
  );
}
