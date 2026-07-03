import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
// Use the real WebGPU + LoRA runtime (delegates to emberglass).
// This is the only allowed import for agent behavior going forward.
import {
  getAgentStatus,
  generate,
  subscribeAgentStatus,
  isEquippedForRealInference,
  type AgentStatus,
} from "@/lib/runtime/gmail-agent-runtime";
import {
  getPreloadDecision,
  maybePreloadAgent,
  startAgentLoad,
  subscribePreloadDecision,
  type PreloadDecision,
} from "@/lib/runtime/agent-preload";
import { recordAgentTrace } from "@/lib/agent/trace-recorder";

/** Live agent status without tearing (status snapshots are fresh objects, so
 *  plain state + subscription instead of useSyncExternalStore). */
export function useAgentStatus(): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>(getAgentStatus());
  useEffect(() => subscribeAgentStatus(setStatus), []);
  return status;
}

export function usePreloadDecision(): PreloadDecision {
  const [decision, setDecision] = useState<PreloadDecision>(getPreloadDecision());
  useEffect(
    () => subscribePreloadDecision(() => setDecision(getPreloadDecision())),
    [],
  );
  return decision;
}

export function agentStatusLabel(status: AgentStatus): string {
  const isReal = isEquippedForRealInference() || status.state === "equipped";
  return isReal ? "REAL (tuned)" : status.state === "error" ? "ERROR" : "COLD (no weights)";
}

/** The status dot: color tells the state at a glance, tap reveals the honest
 *  one-line detail (label + progress + last error). E2E reads data-agent-state. */
export function AgentStatusDot({ className }: { className?: string }) {
  const status = useAgentStatus();
  const [detail, setDetail] = useState(false);
  const label = agentStatusLabel(status);
  const isReal = label === "REAL (tuned)";
  const isError = label === "ERROR";

  return (
    <button
      type="button"
      onClick={() => setDetail((d) => !d)}
      aria-label={label}
      data-agent-state={status.state}
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 flex-none rounded-full",
          isReal ? "bg-success" : isError ? "bg-destructive" : "bg-amber-500",
          status.state === "loading" && "animate-pulse",
        )}
      />
      {detail && (
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {label}
          {status.progress ? ` · ${Math.round(status.progress.frac * 100)}%` : ""}
          {status.lastError ? ` · ${status.lastError}` : ""}
        </span>
      )}
    </button>
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────

type AssistantPayload = {
  plan: unknown;
  execution?: unknown;
  note?: string;
};

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; payload?: AssistantPayload };

function planSteps(plan: unknown): Array<{ tool: string; args: Record<string, unknown> }> {
  const p = plan as any;
  if (p && Array.isArray(p.steps)) return p.steps;
  if (p && typeof p.tool === "string") return [{ tool: p.tool, args: p.args ?? {} }];
  return [];
}

function shortValue(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function summarizeExecution(execution: unknown): string {
  if (execution === undefined) return "";
  if (Array.isArray(execution)) return `${execution.length} result${execution.length === 1 ? "" : "s"}`;
  const s = JSON.stringify(execution);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

/** Compact plan rows + one-line execution summary, with the full JSON kept
 *  under a "raw" disclosure for honest inspection (also what E2E greps). */
function AssistantBody({ payload, fallback }: { payload?: AssistantPayload; fallback: string }) {
  if (!payload) return <>{fallback}</>;
  const steps = planSteps(payload.plan);
  const exec = summarizeExecution(payload.execution);
  return (
    <div className="flex flex-col gap-1.5">
      {steps.length > 0 ? (
        steps.map((step, i) => (
          <div key={i} className="font-mono text-[11px] leading-relaxed">
            <span className="font-semibold">{step.tool}</span>{" "}
            <span className="text-muted-foreground">
              {Object.entries(step.args ?? {})
                .map(([k, v]) => `${k}: ${shortValue(v)}`)
                .join(" · ")}
            </span>
          </div>
        ))
      ) : (
        <div className="font-mono text-[11px] text-muted-foreground">no tool plan</div>
      )}
      {exec && (
        <div className="font-mono text-[11px] text-muted-foreground">→ {exec}</div>
      )}
      {payload.note && (
        <div className="text-[11px] text-muted-foreground">{payload.note}</div>
      )}
      <details>
        <summary className="cursor-pointer font-mono text-[10px] text-muted-foreground/70 select-none">
          raw
        </summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
          {JSON.stringify({ plan: payload.plan, execution: payload.execution }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ── The chat body (shared by the board tile and the mobile sheet) ───────────

export function AgentChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const status = useAgentStatus();
  const decision = usePreloadDecision();

  // Joins the preload stream if it's already running; makes the honest
  // started/deferred/unsupported decision if the chat is the first to ask.
  useEffect(() => {
    void maybePreloadAgent();
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setPending(true);

    try {
      const plan = await generate(text); // Plan object (or safe cold fallback)

      const isCold = (plan as any).__cold === true;
      const isReal = !isCold && getAgentStatus().state === "equipped";
      recordAgentTrace(
        text,
        "tool" in (plan as any)
          ? [{ name: (plan as any).tool, args: (plan as any).args }]
          : (plan as any).steps?.map((s: any) => ({ name: s.tool, args: s.args })) || [],
      );

      let payload: AssistantPayload | undefined;
      let fallback = isReal
        ? `REAL ENGINE — Plan: ${JSON.stringify(plan, null, 2)}`
        : `COLD (no weights) — Plan: ${JSON.stringify(plan, null, 2)}`;

      try {
        const mod = await import("@/lib/agent/real-gmail-tools");
        const exec = await mod.executePlan(plan);
        payload = { plan, execution: exec };
      } catch (ex: any) {
        if (isCold || /cold|non-inference/i.test(String(ex?.message || ex))) {
          fallback = `COLD — refusing execution: ${(plan as any).__cold ? "plan marked __cold" : ex?.message || ex}`;
          payload = undefined;
        } else {
          payload = {
            plan,
            note: `Execution note: ${ex?.message || ex}. Connect a real Gmail account after vault unlock.`,
          };
        }
      }

      setMessages((curr) =>
        curr.map((m, i) =>
          i === curr.length - 1 ? { ...m, content: fallback, payload } : m,
        ),
      );
    } finally {
      setPending(false);
    }
  };

  // Expose for console / testing the real serving path
  if (typeof window !== "undefined") {
    (window as any).loadRealGmailLoRA = startAgentLoad;
    (window as any).isRealGmailEngine = isEquippedForRealInference;
  }

  const equipped = isEquippedForRealInference() || status.state === "equipped";
  const unsupported = decision === "unsupported";
  const deferred = decision === "deferred-cellular" && !equipped;
  const failed = status.state === "error" && !equipped;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto p-3 text-[13px]">
        {unsupported && (
          <div className="mb-2 rounded border border-hairline p-2 font-mono text-[11px] text-muted-foreground">
            The local agent can't run on this device (WebGPU unavailable or GPU
            too small). Mail still works.
          </div>
        )}
        {deferred && (
          <div className="mb-2 flex flex-col gap-2 rounded border border-hairline p-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              You're on a metered connection. The local model is a 6 GB
              download — start it now, or it will wait for Wi-Fi.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start text-[11px]"
              onClick={() => startAgentLoad().catch(() => {})}
            >
              Start 6 GB download
            </Button>
          </div>
        )}
        {failed && (
          <div className="mb-2 flex flex-col gap-2 rounded border border-destructive/30 p-2">
            <p className="font-mono text-[10px] text-destructive">
              Last error: {status.lastError ?? "model load failed"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start text-[11px]"
              onClick={() => startAgentLoad().catch(() => {})}
            >
              Retry load
            </Button>
          </div>
        )}
        {messages.length === 0 && !unsupported && (
          <div className="text-muted-foreground">
            {equipped
              ? "Model ready. Ask for a search, a read, or a draft — plans run on your machine."
              : "Loading the local model (VibeThinker-3B + Gmail LoRA). You can type as soon as the dot turns green — everything runs on your machine."}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "mb-2 max-w-[88%] rounded p-2 whitespace-pre-wrap",
              m.role === "user" ? "ml-auto bg-primary text-on-primary" : "bg-muted",
            )}
          >
            {m.role === "assistant" ? (
              <AssistantBody payload={m.payload} fallback={m.content} />
            ) : (
              m.content
            )}
          </div>
        ))}
        {pending && (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <form className="flex gap-2 border-t p-2" onSubmit={send}>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          placeholder="e.g. Find all unread from manager this week..."
          disabled={unsupported}
          className="flex-1 text-[13px]"
        />
        <Button size="icon" disabled={!input.trim() || pending || unsupported}>
          <Send />
        </Button>
      </form>
    </div>
  );
}
