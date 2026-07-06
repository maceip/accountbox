import { useEffect, useState } from "react";

import {
  getChatStatus,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
  type ChatStatus,
} from "@/lib/runtime/chat-runtime";
import type { AgentStatus } from "@/lib/runtime/agent-runtime";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import { agentModeSkill } from "@/lib/runtime/agent-mode";
import {
  probeAgentSupport,
  type AgentSupport,
} from "@/lib/runtime/agent-preload";
import { SKILLS } from "@/lib/skills";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

/**
 * Idle-state telemetry for the queue tray. Every segment is a real,
 * operator-relevant fact (engine residency, device verdict, local storage
 * footprint, trace recording) — never invented activity. The strip answers
 * "can this machine run, what's loaded, what is it costing" at a glance,
 * the way an ops panel never goes fully dark.
 */

export function useEngineTelemetry(): {
  chat: ChatStatus;
  skill: AgentStatus;
  skillLabel: string;
} {
  const activeSkill = agentModeSkill() ?? SKILLS[0];
  const [chat, setChat] = useState(getChatStatus());
  const [skill, setSkill] = useState<AgentStatus>(() =>
    getSkillRuntime(activeSkill).getAgentStatus(),
  );
  useEffect(() => subscribeChatStatus(setChat), []);
  useEffect(() => {
    const rt = getSkillRuntime(activeSkill);
    setSkill(rt.getAgentStatus());
    return rt.subscribeAgentStatus(setSkill);
  }, [activeSkill]);
  return { chat, skill, skillLabel: activeSkill.label };
}

export function useDeviceSupport(): AgentSupport | null {
  const [support, setSupport] = useState<AgentSupport | null>(null);
  useEffect(() => {
    let alive = true;
    probeAgentSupport().then((r) => {
      if (alive) setSupport(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return support;
}

export function useStorageEstimate(): { usage: number; quota: number } | null {
  const [estimate, setEstimate] = useState<{
    usage: number;
    quota: number;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    navigator.storage
      ?.estimate?.()
      .then((e) => {
        if (alive && e.usage != null && e.quota != null)
          setEstimate({ usage: e.usage, quota: e.quota });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return estimate;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

type LedTone = "off" | "loading" | "on" | "blocked";

const LED: Record<LedTone, string> = {
  off: "bg-ink-tertiary/50",
  loading: "bg-primary animate-pulse",
  on: "bg-accent-2",
  blocked: "bg-label-red",
};

function Segment({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone: LedTone;
  title?: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.04em] uppercase"
      title={title}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", LED[tone])} />
      <span className="shrink-0 text-ink-tertiary">{label}</span>
      <span className="truncate text-ink-subtle">{value}</span>
    </div>
  );
}

export function RuntimeTelemetryStrip({ className }: { className?: string }) {
  const { chat, skill, skillLabel } = useEngineTelemetry();
  const support = useDeviceSupport();
  const storage = useStorageEstimate();
  const { traceRecording } = useSettings();

  const engine: { value: string; tone: LedTone } =
    chat.state === "ready"
      ? { value: `resident · ${CHAT_MODEL_LABEL}`, tone: "on" }
      : skill.state === "equipped"
        ? { value: `equipped · ${skillLabel}`, tone: "on" }
        : chat.state === "loading" || skill.state === "loading"
          ? { value: "loading…", tone: "loading" }
          : chat.state === "error" || skill.state === "error"
            ? { value: "error", tone: "blocked" }
            : { value: "cold", tone: "off" };

  const device: { value: string; tone: LedTone } =
    support === null
      ? { value: "probing…", tone: "loading" }
      : support.ok
        ? { value: "webgpu ok", tone: "on" }
        : { value: "blocked", tone: "blocked" };

  return (
    <div
      data-runtime-telemetry
      className={cn(
        "flex items-center gap-4 overflow-hidden rounded-md border border-hairline bg-surface-1 px-3 py-1.5",
        className,
      )}
    >
      <Segment label="engine" value={engine.value} tone={engine.tone} />
      <Segment
        label="device"
        value={device.value}
        tone={device.tone}
        title={support && !support.ok ? support.reason : undefined}
      />
      {storage && (
        <Segment
          label="store"
          value={`${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`}
          tone={storage.usage > 0 ? "on" : "off"}
          title="Local browser storage used by models, adapters, and traces"
        />
      )}
      <Segment
        label="traces"
        value={traceRecording ? "rec" : "off"}
        tone={traceRecording ? "on" : "off"}
        title="Local OPFS trace recording — never leaves this device"
      />
      <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-tertiary uppercase">
        queue idle
      </span>
    </div>
  );
}
