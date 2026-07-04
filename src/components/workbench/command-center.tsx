import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Plug,
  Swords,
} from "lucide-react";

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
import { SOURCES } from "@/lib/sources";
import { Button } from "@/components/ui/button";
import { LoadoutSlots, type LoadoutSlot } from "./loadout-slots";
import { ReadinessBar, type ReadinessItem } from "./readiness-bar";
import { ProductionQueue, type QueueRow } from "./production-queue";
import { StatusChip } from "./status-chip";

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
        label: "Base model",
        detail:
          mode === "chat"
            ? CHAT_MODEL_LABEL
            : "Qwen base (skill slot)",
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
        detail: activeSkill.allowedTools.join(", "),
        state: "available",
      },
      {
        id: "source",
        label: "Source",
        detail: "Gmail",
        state: gmailConnected ? "passing" : "blocked",
      },
      {
        id: "eval",
        label: "Eval suite",
        detail: "Not run",
        state: "empty",
      },
      {
        id: "runtime",
        label: "Runtime",
        detail: preload,
        state:
          preload === "unsupported"
            ? "blocked"
            : skillStatus.state === "equipped" || chatStatus.state === "ready"
              ? "equipped"
              : preload === "deferred-cellular"
                ? "loading"
                : "empty",
      },
    ],
    [
      activeSkill,
      chatStatus.state,
      gmailConnected,
      mode,
      preload,
      skillStatus.state,
    ],
  );

  const readiness: ReadinessItem[] = useMemo(
    () => [
      {
        id: "model",
        label: "Model available",
        ready:
          chatStatus.state === "ready" ||
          skillStatus.state === "equipped" ||
          skillStatus.state === "loaded",
        detail:
          chatStatus.state === "loading" || skillStatus.state === "loading"
            ? "Streaming weights…"
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
        detail: "Run evals from Eval Range",
      },
      {
        id: "source",
        label: "Source connected",
        ready: gmailConnected,
        detail: gmailConnected ? `${accounts?.length} account(s)` : "Connect Gmail",
      },
      {
        id: "tools",
        label: "Tools whitelisted",
        ready: true,
        detail: activeSkill.allowedTools.join(", "),
      },
      {
        id: "route",
        label: "Execution route",
        ready: skillStatus.state === "equipped" && gmailConnected,
        detail: "create_draft only",
      },
    ],
    [accounts?.length, activeSkill.allowedTools, chatStatus.state, gmailConnected, skillStatus.state],
  );

  const queue: QueueRow[] = useMemo(() => {
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

  const blocker = useMemo(() => {
    if (preload === "unsupported")
      return "WebGPU unavailable — runtime blocked on this device.";
    if (!gmailConnected) return "Connect Gmail under Sources to ground the skill.";
    if (skillStatus.state !== "equipped" && mode !== "chat")
      return "Equip the skill from Skills → Loadout.";
    if (mode === "chat" && chatStatus.state !== "ready")
      return "Load the chat model from Runtime.";
    return null;
  }, [chatStatus.state, gmailConnected, mode, preload, skillStatus.state]);

  return (
    <div className="wb-grain flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
            command center
          </p>
          <h1 className="text-lg font-semibold text-ink">Operations base</h1>
          <p className="mt-1 max-w-xl text-[13px] text-ink-subtle">
            What am I training? Is it equipped? Is it passing? What source powers
            it? What can it safely do?
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" render={<Link to="/skills" />}>
            <Swords className="size-3.5" />
            Skills
          </Button>
          <Button size="sm" variant="outline" render={<Link to="/runtime" />}>
            Runtime
          </Button>
        </div>
      </header>

      {blocker && (
        <div className="wb-panel mb-4 flex items-start gap-2 border-warning/30 bg-warning/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-[13px] text-ink-muted">{blocker}</p>
        </div>
      )}

      <section className="mb-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
            active loadout
          </h2>
          <StatusChip kind="command">{activeSkill.label}</StatusChip>
        </div>
        <LoadoutSlots slots={loadoutSlots} />
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ReadinessBar items={readiness} />
        <div className="space-y-2">
          <h2 className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
            production queue
          </h2>
          <ProductionQueue rows={queue} emptyLabel="No active downloads or runs" />
        </div>
      </div>

      <section className="mb-4">
        <h2 className="mb-2 font-mono text-[10px] tracking-wide text-ink-muted uppercase">
          connected sources
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.filter((s) => s.connection).map((source) => {
            const connected =
              source.id === "gmail"
                ? gmailConnected
                : source.id === "github"
                  ? false
                  : false;
            return (
              <li
                key={source.id}
                className="wb-panel-raised flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{source.label}</p>
                  <p className="font-mono text-[10px] text-ink-subtle">
                    {source.soon ? "Soon" : connected ? "Connected" : "Not linked"}
                  </p>
                </div>
                <StatusChip
                  kind={
                    source.soon
                      ? "info"
                      : connected
                        ? "ready"
                        : source.id === "github"
                          ? "info"
                          : "warning"
                  }
                >
                  {source.soon ? "soon" : connected ? "live" : "cold"}
                </StatusChip>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[10px] tracking-wide text-ink-muted uppercase">
          next action
        </h2>
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
      </section>
    </div>
  );
}
