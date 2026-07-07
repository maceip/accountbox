import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Plug, Swords } from "lucide-react";

import { SOURCES } from "@/lib/sources";
import {
  getSourceById,
  useSourceConnected,
} from "@/lib/sources/connections";
import { SKILLS, getSkill } from "@/lib/skills";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import {
  getChatStatus,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
  CHAT_MODEL_URL,
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
  const chatStatus = useChatStatus();
  const preload = usePreloadDecision();
  const activeSkill = agentModeSkill() ?? SKILLS[0];
  const skillStatus = useSkillStatus(activeSkill.id);
  const mode = getAgentMode();

  // Source readiness follows the ACTIVE skill's declared source — a third
  // cartridge gets truthful readiness rows by registering, not by edits here.
  const activeSource = getSourceById(SOURCES, activeSkill.sourceId);
  const { connected: sourceConnected, count: sourceAccounts } =
    useSourceConnected(activeSource);
  const sourceLabel = activeSource?.label ?? activeSkill.sourceId;

  // FULL SPEC lines come straight from the skill manifest and runtime status —
  // ids, whitelists, provenance. Nothing here is invented for effect.
  const loadoutSlots: LoadoutSlot[] = useMemo(
    () => [
      {
        id: "base",
        label: "Base",
        detail:
          mode === "chat"
            ? CHAT_MODEL_LABEL
            : (skillStatus.modelLabel ?? "Qwen base"),
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
        spec: [
          mode === "chat"
            ? `src ${CHAT_MODEL_URL}`
            : (skillStatus.modelLabel ?? "weights not resident"),
          "webgpu · runs on this device",
        ],
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
        spec: [
          activeSkill.adapterUrl ?? "no adapter shipped",
          skillStatus.adapterVersion
            ? `manifest ${skillStatus.adapterVersion}`
            : activeSkill.availability,
        ],
      },
      {
        id: "policy",
        label: "Policy",
        detail: activeSkill.safeAction.tool ?? "read-only",
        state: "available",
        spec: [
          `${activeSkill.allowedTools.length} tools whitelisted`,
          `write: ${activeSkill.safeAction.effect}`,
        ],
      },
      {
        id: "dataset",
        label: "Dataset",
        detail: "—",
        state: "empty",
        spec: [
          "no local dataset",
          `sources: ${activeSkill.trainingSources.join(" ")}`,
        ],
      },
      {
        id: "source",
        label: "Source",
        detail: sourceConnected ? "Loaded" : "Cold",
        state: sourceConnected ? "passing" : "blocked",
        spec: [
          `${activeSkill.sourceId} · ${sourceAccounts} account(s)`,
          "live fetch — never persisted",
        ],
      },
      {
        id: "eval",
        label: "Eval",
        detail: "Not run",
        state: "empty",
        spec: [
          `${activeSkill.evalCases.length} seed cases`,
          "no pass recorded on this device",
        ],
      },
    ],
    [
      activeSkill,
      chatStatus.state,
      mode,
      skillStatus.adapterVersion,
      skillStatus.modelLabel,
      skillStatus.state,
      sourceAccounts,
      sourceConnected,
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
        ready: sourceConnected,
        detail: sourceConnected
          ? sourceAccounts > 0
            ? `${sourceAccounts} account(s)`
            : "No account needed"
          : `Connect ${sourceLabel}`,
        tone: sourceConnected ? undefined : "pending",
      },
      {
        id: "tools",
        label: "Tools whitelisted",
        ready: true,
      },
      {
        id: "route",
        label: "Execution route",
        ready: skillStatus.state === "equipped" && sourceConnected,
        detail: activeSkill.safeAction.label,
        tone:
          skillStatus.state === "equipped" && sourceConnected
            ? undefined
            : "blocked",
      },
    ],
    [
      activeSkill.safeAction.label,
      chatStatus.state,
      skillStatus.state,
      sourceAccounts,
      sourceConnected,
      sourceLabel,
    ],
  );

  const blocker = useMemo(() => {
    if (preload === "unsupported")
      return "WebGPU unavailable — runtime blocked on this device.";
    if (!sourceConnected)
      return `Connect ${sourceLabel} under Sources to enable automated indexing.`;
    if (skillStatus.state !== "equipped" && mode !== "chat")
      return "Equip the skill from Skills → Loadout.";
    if (mode === "chat" && chatStatus.state !== "ready")
      return "Load the chat model from Runtime.";
    return null;
  }, [
    chatStatus.state,
    mode,
    preload,
    skillStatus.state,
    sourceConnected,
    sourceLabel,
  ]);

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
            !sourceConnected ? (
              <Button
                size="xs"
                variant="outline"
                className="border-(--color-blocker-border) bg-(--color-blocker-bg) font-mono text-[10px] uppercase"
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

      <ConnectedSourcesBlock />

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
