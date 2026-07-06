import { CHAT_MODEL_LABEL } from "@/lib/runtime/chat-runtime";
import { agentModeSkill } from "@/lib/runtime/agent-mode";
import { SKILLS } from "@/lib/skills";
import { useSettings } from "@/hooks/use-settings";
import type { StatusKind } from "./status-chip";
import { InspectorPanel } from "./inspector-panel";
import {
  formatBytes,
  useDeviceSupport,
  useEngineTelemetry,
  useStorageEstimate,
} from "./runtime-telemetry";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-ink-tertiary uppercase">
        {label}
      </span>
      <span className="truncate text-right font-mono text-[11px] text-ink-subtle">
        {value}
      </span>
    </div>
  );
}

/**
 * Default inspector content: with nothing selected, the workbench inspects
 * itself. Every row is a live, real value (runtime residency, device verdict,
 * storage footprint, active policy) — the rail never sits empty, and never
 * shows invented activity.
 */
export function SystemInspector({ className }: { className?: string }) {
  const { chat, skill, skillLabel } = useEngineTelemetry();
  const support = useDeviceSupport();
  const storage = useStorageEstimate();
  const { traceRecording } = useSettings();
  const activeSkill = agentModeSkill() ?? SKILLS[0];

  const ready = chat.state === "ready" || skill.state === "equipped";
  const blocked = support !== null && !support.ok;
  const state = blocked ? "blocked" : ready ? "ready" : "cold";
  const stateKind: StatusKind = blocked ? "blocked" : ready ? "ready" : "info";

  return (
    <InspectorPanel
      className={className}
      title="Workbench"
      state={state}
      stateKind={stateKind}
      sections={[
        {
          title: "runtime",
          content: (
            <div>
              <Row
                label="chat model"
                value={
                  chat.state === "ready"
                    ? `${CHAT_MODEL_LABEL} · resident`
                    : chat.state
                }
              />
              <Row
                label="skill"
                value={
                  skill.state === "equipped"
                    ? `${skillLabel} · equipped`
                    : `${skillLabel} · ${skill.state}`
                }
              />
              {skill.adapterVersion && (
                <Row label="adapter" value={skill.adapterVersion} />
              )}
            </div>
          ),
        },
        {
          title: "device",
          content: (
            <div>
              <Row
                label="webgpu"
                value={
                  support === null ? "probing…" : support.ok ? "ok" : "blocked"
                }
              />
              {support !== null && !support.ok && (
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-subtle">
                  {support.reason}
                </p>
              )}
            </div>
          ),
        },
        {
          title: "storage",
          content: (
            <div>
              <Row
                label="local store"
                value={
                  storage
                    ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`
                    : "—"
                }
              />
              <Row label="traces" value={traceRecording ? "recording" : "off"} />
            </div>
          ),
        },
        {
          title: "policy",
          content: (
            <div>
              <Row label="cartridge" value={activeSkill.id} />
              <Row
                label="tools"
                value={`${activeSkill.allowedTools.length} whitelisted`}
              />
              <Row label="write" value={activeSkill.safeAction.effect} />
            </div>
          ),
        },
      ]}
      actions={
        <p className="font-mono text-[10px] leading-relaxed text-ink-tertiary">
          Select a run, skill, or artifact to inspect it here.
        </p>
      }
    />
  );
}
