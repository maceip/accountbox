import { useEffect, useState, type FormEvent } from "react";
import { CheckIcon, ChevronDownIcon, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WavyLinearProgress } from "@/components/ui/wavy-progress";
import { cn } from "@/lib/utils";
// The agent talks to REAL runtimes only: per-skill planners via the shared
// skill-runtimes registry, plain chat via chat-runtime. One GPU slot — the
// mode switcher below swaps which weights are resident.
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import { SKILLS } from "@/lib/skills";
import type { AppSkill } from "@/lib/runtime/app-skill";
import type { AgentStatus } from "@/lib/runtime/agent-runtime";
import {
  agentModeSkill,
  getAgentMode,
  setAgentMode,
  subscribeAgentMode,
  type AgentModeId,
} from "@/lib/runtime/agent-mode";
import {
  chat as chatGenerate,
  getChatStatus,
  loadChatModel,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
  type ChatStatus,
  type ChatTurn,
} from "@/lib/runtime/chat-runtime";
import {
  getPreloadDecision,
  maybePreloadAgent,
  startAgentLoad,
  subscribePreloadDecision,
  type PreloadDecision,
} from "@/lib/runtime/agent-preload";
import { recordAgentTrace } from "@/lib/agent/trace-recorder";

// ── Mode (chat model vs. skill planner) ──────────────────────────────────────

export function useAgentMode(): AgentModeId {
  const [mode, setMode] = useState<AgentModeId>(getAgentMode());
  useEffect(() => subscribeAgentMode(() => setMode(getAgentMode())), []);
  return mode;
}

/** Live status of the ACTIVE skill runtime (defaults to the first skill so
 *  existing status surfaces keep reporting the planner's state). */
export function useAgentStatus(): AgentStatus {
  const mode = useAgentMode();
  const skill = agentModeSkill() ?? SKILLS[0];
  const [status, setStatus] = useState<AgentStatus>(() =>
    getSkillRuntime(skill).getAgentStatus(),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-subscribe when the mode changes skill identity.
  useEffect(() => {
    const rt = getSkillRuntime(skill);
    setStatus(rt.getAgentStatus());
    return rt.subscribeAgentStatus(setStatus);
  }, [mode]);
  return status;
}

function useChatStatus(): ChatStatus {
  const [status, setStatus] = useState<ChatStatus>(getChatStatus());
  useEffect(() => subscribeChatStatus(setStatus), []);
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
  const isReal = status.state === "equipped";
  return isReal ? "REAL (tuned)" : status.state === "error" ? "ERROR" : "COLD (no weights)";
}

/** The status dot: color tells the ACTIVE mode's state at a glance, tap
 *  reveals the honest one-line detail. E2E reads data-agent-state. */
export function AgentStatusDot({ className }: { className?: string }) {
  const mode = useAgentMode();
  const status = useAgentStatus();
  const chatStatus = useChatStatus();
  const [detail, setDetail] = useState(false);

  const chatMode = mode === "chat";
  const live = chatMode ? chatStatus.state === "ready" : status.state === "equipped";
  const errored = chatMode ? chatStatus.state === "error" : status.state === "error";
  const loading = chatMode ? chatStatus.state === "loading" : status.state === "loading";
  const label = chatMode
    ? live
      ? `READY (${CHAT_MODEL_LABEL})`
      : errored
        ? "ERROR"
        : "COLD (no weights)"
    : agentStatusLabel(status);
  const progress = chatMode ? chatStatus.progress : status.progress;
  const lastError = chatMode ? chatStatus.lastError : status.lastError;

  return (
    <button
      type="button"
      onClick={() => setDetail((d) => !d)}
      aria-label={label}
      data-agent-state={chatMode ? chatStatus.state : status.state}
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 flex-none rounded-full",
          live ? "bg-success" : errored ? "bg-destructive" : "bg-amber-500",
          loading && "animate-pulse",
        )}
      />
      {detail && (
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {label}
          {progress ? ` · ${Math.round(progress.frac * 100)}%` : ""}
          {lastError ? ` · ${lastError}` : ""}
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

// ── Mode switcher (the model-picker gesture, but the models are local) ──────

function modeLabel(mode: AgentModeId): string {
  if (mode === "chat") return `Chat · ${CHAT_MODEL_LABEL}`;
  const skill = SKILLS.find((s) => s.id === mode);
  return skill ? `${skill.label} skill` : mode;
}

function switchTo(mode: AgentModeId) {
  setAgentMode(mode);
  // Selecting a mode claims the GPU slot for its weights right away — the
  // status surfaces stream the swap honestly.
  if (mode === "chat") {
    loadChatModel().catch(() => {});
  } else {
    const skill = SKILLS.find((s) => s.id === mode);
    if (skill) {
      getSkillRuntime(skill)
        .equipAdapter({ type: "http", url: skill.adapterUrl })
        .catch(() => {});
    }
  }
}

function ModeSwitcher() {
  const mode = useAgentMode();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-agent-mode={mode}
        className="inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <span className="truncate">{modeLabel(mode)}</span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => switchTo("chat")}>
          <span className="flex-1">Chat · {CHAT_MODEL_LABEL}</span>
          {mode === "chat" && <CheckIcon className="size-3.5" />}
        </DropdownMenuItem>
        {SKILLS.map((skill) => (
          <DropdownMenuItem key={skill.id} onClick={() => switchTo(skill.id)}>
            <span className="flex-1">{skill.label} skill · VibeThinker+LoRA</span>
            {mode === skill.id && <CheckIcon className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── The chat body (shared by the board tile and the mobile sheet) ───────────

export function AgentChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const mode = useAgentMode();
  const status = useAgentStatus();
  const chatStatus = useChatStatus();
  const decision = usePreloadDecision();

  // Joins the preload stream if it's already running; makes the honest
  // started/deferred/unsupported decision if the chat is the first to ask.
  useEffect(() => {
    void maybePreloadAgent();
  }, []);

  const chatMode = mode === "chat";
  const activeSkill: AppSkill | null = agentModeSkill();

  const sendToSkill = async (text: string, skill: AppSkill) => {
    const rt = getSkillRuntime(skill);
    const plan = await rt.generate(text); // Plan object (or safe cold fallback)

    const isCold = (plan as any).__cold === true;
    const isReal = !isCold && rt.getAgentStatus().state === "equipped";
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
      const mod = await import("@/lib/agent/execute-plan");
      const exec = await mod.executePlan(skill.id, plan as any);
      payload = { plan, execution: exec };
    } catch (ex: any) {
      if (isCold || /cold|non-inference/i.test(String(ex?.message || ex))) {
        fallback = `COLD — refusing execution: ${(plan as any).__cold ? "plan marked __cold" : ex?.message || ex}`;
        payload = undefined;
      } else {
        payload = {
          plan,
          note: `Execution note: ${ex?.message || ex}. Connect the account to power execution.`,
        };
      }
    }

    setMessages((curr) =>
      curr.map((m, i) =>
        i === curr.length - 1 ? { ...m, content: fallback, payload } : m,
      ),
    );
  };

  const sendToChat = async (text: string, history: ChatMessage[]) => {
    const turns: ChatTurn[] = [
      ...history
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }) as ChatTurn),
      { role: "user", content: text },
    ];
    const reply = await chatGenerate(turns);
    setMessages((curr) =>
      curr.map((m, i) => (i === curr.length - 1 ? { ...m, content: reply } : m)),
    );
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    const history = messages;
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setPending(true);

    try {
      if (chatMode) await sendToChat(text, history);
      else if (activeSkill) await sendToSkill(text, activeSkill);
    } catch (err: any) {
      setMessages((curr) =>
        curr.map((m, i) =>
          i === curr.length - 1
            ? { ...m, content: `(error: ${err?.message || err})` }
            : m,
        ),
      );
    } finally {
      setPending(false);
    }
  };

  // Expose for console / testing the real serving path
  if (typeof window !== "undefined") {
    (window as any).loadRealGmailLoRA = startAgentLoad;
    (window as any).isRealGmailEngine = () =>
      SKILLS.some((s) => getSkillRuntime(s).isEquippedForRealInference());
  }

  const equipped = chatMode ? chatStatus.state === "ready" : status.state === "equipped";
  const loading = chatMode ? chatStatus.state === "loading" : status.state === "loading";
  const frac = chatMode ? chatStatus.progress?.frac : status.progress?.frac;
  const unsupported = decision === "unsupported";
  const deferred = decision === "deferred-cellular" && !equipped && !loading;
  const failed = (chatMode ? chatStatus.state === "error" : status.state === "error") && !equipped;
  const retryLoad = () =>
    chatMode ? loadChatModel().catch(() => {}) : startAgentLoad().catch(() => {});

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <ModeSwitcher />
        {loading && (
          <span className="ml-auto flex items-center gap-2">
            <WavyLinearProgress
              value={frac !== undefined ? frac * 100 : undefined}
              width={90}
              strokeWidth={2.5}
              amplitude={2}
              wavelength={22}
              className="shrink-0 text-primary"
              aria-label="Streaming model weights"
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {frac !== undefined ? `${Math.round(frac * 100)}%` : "…"}
            </span>
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 text-[13px]">
        {unsupported && (
          <div className="mb-2 rounded border border-hairline p-2 font-mono text-[11px] text-muted-foreground">
            The local agent can't run on this device (WebGPU unavailable or GPU
            too small). The rest of the workbench still works.
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
              onClick={retryLoad}
            >
              Start 6 GB download
            </Button>
          </div>
        )}
        {failed && (
          <div className="mb-2 flex flex-col gap-2 rounded border border-destructive/30 p-2">
            <p className="font-mono text-[10px] text-destructive">
              Last error: {(chatMode ? chatStatus.lastError : status.lastError) ?? "model load failed"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start text-[11px]"
              onClick={retryLoad}
            >
              Retry load
            </Button>
          </div>
        )}
        {messages.length === 0 && !unsupported && (
          <div className="text-muted-foreground">
            {chatMode
              ? equipped
                ? "Chat model ready. Everything you say is answered on your GPU."
                : `Loading the chat model (${CHAT_MODEL_LABEL}). You can type as soon as the dot turns green.`
              : equipped
                ? "Model ready. Ask for a search, a read, or a draft — plans run on your machine."
                : `Loading the ${activeSkill?.label ?? "skill"} planner (VibeThinker-3B + LoRA). You can type as soon as the dot turns green — everything runs on your machine.`}
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
          placeholder={
            chatMode
              ? "Say anything — computed on your GPU…"
              : "e.g. Find all unread from manager this week..."
          }
          disabled={unsupported}
          className="flex-1 text-[13px]"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || pending || unsupported} aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  );
}
