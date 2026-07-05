/**
 * Agents Lab — the ax multi-agent surface.
 *
 * Left: the Concierge chatbox (Qwen2.5-3B chat model behind an ax program
 * with prompt-mode tools). Right: the agent activity rail (every handoff,
 * tool call, refusal) and the Trainer panel (real in-browser LoRA training
 * on the bbtriage dataset: loss curve, held-out eval delta, OPFS export /
 * re-equip). Panel buttons drive the same runtime functions the agent tools
 * call — deterministic for E2E, identical code path.
 *
 * Rendering rules: machine output (losses, JSON, event log, model labels) is
 * mono; human text is Roboto. Nothing here fabricates — every number is a
 * real GPU measurement and every reply is verbatim model output.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Bot, FlaskConical, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getChatStatus,
  loadChatModel,
  subscribeChatStatus,
} from "@/lib/runtime/chat-runtime";
import {
  getTrainerStatus,
  subscribeTrainerStatus,
  loadTrainerBase,
  loadTrainerDataset,
  loadGrpoDataset,
  runTraining,
  runGrpo,
  runEval,
  grpoHeldoutAccuracy,
  exportTrainedAdapter,
  equipAdapterOnTrainer,
  type GrpoStep,
} from "@/lib/agents/train-runtime";
import { BBTRIAGE_DATASET } from "@/lib/agents/bbtriage";
import {
  getAgentEvents,
  subscribeAgentEvents,
  pushAgentEvent,
  runConciergeTurn,
  runBbtriage,
  type AgentEvent,
} from "@/lib/agents/orchestrator";

// ---------------------------------------------------------------------------
// Concierge chat
// ---------------------------------------------------------------------------

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
}

function ConciergeChat() {
  const chatStatus = useSyncExternalStore(
    subscribeChatStatus,
    getChatStatus,
    getChatStatus,
  );
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef("");

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setEntries((e) => [...e, { role: "user", content: message }]);
    try {
      const { reply } = await runConciergeTurn(message, historyRef.current);
      historyRef.current += `user: ${message}\nassistant: ${reply}\n`;
      setEntries((e) => [...e, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushAgentEvent({ agent: "concierge", kind: "error", detail: msg });
      setEntries((e) => [
        ...e,
        { role: "assistant", content: `ERROR: ${msg}` },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <Bot className="size-4 shrink-0" />
        <h2 className="text-[13px] font-semibold">Concierge</h2>
        <span
          data-testid="chat-model-state"
          className={cn(
            "ml-auto font-mono text-[10px] uppercase tracking-wide",
            chatStatus.state === "ready"
              ? "text-accent-2"
              : "text-muted-foreground",
          )}
        >
          {chatStatus.state === "ready"
            ? (chatStatus.modelLabel ?? "ready")
            : chatStatus.state}
        </span>
        {chatStatus.state !== "ready" && chatStatus.state !== "loading" && (
          <Button
            size="sm"
            variant="outline"
            data-testid="chat-load-model"
            onClick={() => void loadChatModel().catch(() => {})}
          >
            Load chat model
          </Button>
        )}
      </div>
      {chatStatus.state === "loading" && chatStatus.progress && (
        <p className="border-b border-hairline px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
          {chatStatus.progress.message} (
          {Math.round(chatStatus.progress.frac * 100)}%)
        </p>
      )}
      <div
        className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
        data-testid="chat-transcript"
      >
        {entries.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            Talk to the local concierge. It can answer directly or hand off to
            the Gmail planner, the bbtriage model, or the in-browser trainer.
          </p>
        )}
        {entries.map((e, i) => (
          <div
            key={`${i}-${e.role}`}
            data-testid={e.role === "assistant" ? "chat-reply" : "chat-user"}
            className={cn(
              "max-w-[85%] rounded-lg border border-hairline px-3 py-2 text-[13px] whitespace-pre-wrap",
              e.role === "user"
                ? "ml-auto bg-surface-2"
                : "bg-surface-1",
            )}
          >
            {e.content}
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> running on-device…
          </p>
        )}
      </div>
      <div className="flex gap-2 border-t border-hairline p-3">
        <Textarea
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message the concierge…"
          className="min-h-[38px] flex-1 resize-none"
          rows={1}
        />
        <Button data-testid="chat-send" disabled={busy} onClick={() => void send()}>
          Send
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Triage handoff panel (drives the same runBbtriage the concierge tool uses)
// ---------------------------------------------------------------------------

function TriagePanel() {
  const [report, setReport] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!report.trim() || busy) return;
    setBusy(true);
    setResult("");
    try {
      setResult(await runBbtriage(report));
    } catch (e) {
      setResult(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [report, busy]);

  return (
    <section className="border-b border-hairline p-3">
      <h3 className="text-[12px] font-semibold">bbtriage handoff</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        VibeThinker-3B + bbtriage LoRA, on-device. Displaces the chat model.
      </p>
      <Textarea
        data-testid="triage-input"
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="Paste a bug bounty submission…"
        className="mt-2 min-h-[64px] font-mono text-[11px]"
      />
      <Button
        size="sm"
        className="mt-2"
        data-testid="triage-run"
        disabled={busy || !report.trim()}
        onClick={() => void run()}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        Triage
      </Button>
      {result && (
        <pre
          data-testid="triage-result"
          className="mt-2 overflow-auto rounded border border-hairline bg-term p-2 font-mono text-[11px] whitespace-pre-wrap"
        >
          {result}
        </pre>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trainer panel
// ---------------------------------------------------------------------------

function LossCurve({ points }: { points: { step: number; loss: number }[] }) {
  if (!points.length) return null;
  const max = Math.max(...points.map((p) => p.loss));
  const min = Math.min(...points.map((p) => p.loss));
  const range = Math.max(1e-6, max - min);
  return (
    <div data-testid="loss-curve" className="mt-2">
      <div className="flex h-16 items-end gap-[2px]">
        {points.map((p) => (
          <div
            key={p.step}
            title={`step ${p.step}: ${p.loss.toFixed(4)}`}
            className="min-w-[3px] flex-1 rounded-t-[1px] bg-accent-2/70"
            style={{ height: `${8 + ((p.loss - min) / range) * 56}px` }}
          />
        ))}
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        loss {points[0].loss.toFixed(4)} →{" "}
        <span data-testid="loss-last">
          {points[points.length - 1].loss.toFixed(4)}
        </span>{" "}
        ({points.length} steps)
      </p>
    </div>
  );
}

function RewardCurve({ points }: { points: GrpoStep[] }) {
  if (!points.length) return null;
  const vals = points.map((p) => p.meanReward);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = Math.max(1e-6, max - min);
  return (
    <div data-testid="reward-curve" className="mt-2">
      <div className="flex h-16 items-end gap-[2px]">
        {points.map((p) => (
          <div
            key={p.step}
            title={`iter ${p.step}: mean reward ${p.meanReward.toFixed(3)}`}
            className="min-w-[3px] flex-1 rounded-t-[1px] bg-accent-2/70"
            style={{ height: `${8 + ((p.meanReward - min) / range) * 56}px` }}
          />
        ))}
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        mean reward {points[0].meanReward.toFixed(3)} →{" "}
        <span data-testid="reward-last">
          {points[points.length - 1].meanReward.toFixed(3)}
        </span>{" "}
        ({points.length} iters)
      </p>
    </div>
  );
}

function TrainerPanel() {
  const status = useSyncExternalStore(
    subscribeTrainerStatus,
    getTrainerStatus,
    getTrainerStatus,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("");

  const act = useCallback(
    (label: string, run: () => Promise<string>) => {
      if (busy) return;
      setBusy(label);
      void run()
        .then((msg) => setLastAction(msg))
        .catch((e) =>
          setLastAction(`ERROR: ${e instanceof Error ? e.message : String(e)}`),
        )
        .finally(() => setBusy(null));
    },
    [busy],
  );

  const evalDelta = (() => {
    const base = status.evals.find((e) => e.label === "base");
    const trained = [...status.evals]
      .reverse()
      .find((e) => e.label === "trained");
    if (!base || !trained) return null;
    return base.meanLoss - trained.meanLoss;
  })();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 shrink-0" />
        <h3 className="text-[12px] font-semibold">Trainer</h3>
        <span
          data-testid="trainer-state"
          className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {status.state}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Real LoRA training on VibeThinker-3B, bbtriage data, this GPU — SFT
        (AdamW) or GRPO (on-policy, verifiable reward).
      </p>
      {status.progress && status.state === "loading" && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {status.progress.message}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-load-base"
          disabled={!!busy}
          onClick={() =>
            act("load-base", async () => {
              await loadTrainerBase();
              return "train base ready";
            })
          }
        >
          Load base
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-load-dataset"
          disabled={!!busy}
          onClick={() =>
            act("load-dataset", async () => {
              const s = await loadTrainerDataset(
                BBTRIAGE_DATASET.train,
                BBTRIAGE_DATASET.heldout,
              );
              return `dataset: ${s.train} train / ${s.heldout} heldout`;
            })
          }
        >
          Load dataset
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-eval-base"
          disabled={!!busy}
          onClick={() =>
            act("eval-base", async () => {
              const r = await runEval("base", { base: true });
              return `heldout base: ${r.meanLoss.toFixed(4)}`;
            })
          }
        >
          Eval base
        </Button>
        <Button
          size="sm"
          data-testid="trainer-train"
          disabled={!!busy}
          onClick={() =>
            act("train", async () => {
              const r = await runTraining({ steps: 20, adapterName: "agents-lab" });
              return `trained ${r.steps} steps: ${r.firstLoss.toFixed(4)} → ${r.lastLoss.toFixed(4)}`;
            })
          }
        >
          Train 20 steps (SFT)
        </Button>
        <Button
          size="sm"
          data-testid="trainer-grpo"
          disabled={!!busy}
          onClick={() =>
            act("grpo", async () => {
              await loadGrpoDataset(
                BBTRIAGE_DATASET.train,
                BBTRIAGE_DATASET.heldout,
              );
              const r = await runGrpo({ iterations: 8, adapterName: "agents-lab-grpo" });
              return `GRPO ${r.iterations} iters: mean reward ${r.firstReward.toFixed(3)} → ${r.lastReward.toFixed(3)}`;
            })
          }
        >
          GRPO 8 iters
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-accuracy"
          disabled={!!busy}
          onClick={() =>
            act("accuracy", async () => {
              const r = await grpoHeldoutAccuracy(8);
              return `heldout accuracy: ${(r.accuracy * 100).toFixed(1)}% (${r.n} ex)`;
            })
          }
        >
          Heldout accuracy
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-eval-trained"
          disabled={!!busy}
          onClick={() =>
            act("eval-trained", async () => {
              const r = await runEval("trained");
              return `heldout trained: ${r.meanLoss.toFixed(4)}`;
            })
          }
        >
          Eval trained
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-export"
          disabled={!!busy}
          onClick={() =>
            act("export", async () => {
              const r = await exportTrainedAdapter("agents-lab");
              return `exported ${r.name} (${r.safetensorsBytes} bytes)`;
            })
          }
        >
          Export → OPFS
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="trainer-equip"
          disabled={!!busy}
          onClick={() =>
            act("equip", async () => {
              const r = await equipAdapterOnTrainer({ opfsName: "agents-lab" });
              return `re-equipped ${r.label} (${r.modules} modules)`;
            })
          }
        >
          Re-equip from OPFS
        </Button>
      </div>
      {busy && (
        <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> {busy}…
        </p>
      )}
      {lastAction && (
        <p
          data-testid="trainer-last-action"
          className="mt-2 font-mono text-[11px]"
        >
          {lastAction}
        </p>
      )}
      {status.lastError && (
        <p className="mt-1 font-mono text-[11px] text-destructive">
          {status.lastError}
        </p>
      )}
      <LossCurve points={status.lossCurve} />
      <RewardCurve points={status.rewardCurve} />
      {status.evals.length > 0 && (
        <div data-testid="eval-results" className="mt-2 space-y-0.5">
          {status.evals.map((e) => (
            <p key={e.at} className="font-mono text-[11px]">
              heldout {e.label}: {e.meanLoss.toFixed(4)} ({e.examples} ex)
            </p>
          ))}
          {evalDelta !== null && (
            <p className="font-mono text-[11px]">
              delta (base − trained):{" "}
              <span
                data-testid="eval-delta"
                className={evalDelta > 0 ? "text-accent-2" : "text-destructive"}
              >
                {evalDelta.toFixed(4)}
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity rail
// ---------------------------------------------------------------------------

const EVENT_COLOR: Record<AgentEvent["kind"], string> = {
  tool_call: "text-ink",
  tool_result: "text-accent-2",
  error: "text-destructive",
  status: "text-muted-foreground",
};

function ActivityRail() {
  const events = useSyncExternalStore(
    subscribeAgentEvents,
    getAgentEvents,
    getAgentEvents,
  );
  return (
    <section className="flex min-h-0 max-h-56 flex-col border-b border-hairline">
      <h3 className="border-b border-hairline px-3 py-2 text-[12px] font-semibold">
        Agent activity
      </h3>
      <div
        data-testid="agent-events"
        className="min-h-0 flex-1 space-y-1 overflow-auto p-3"
      >
        {events.length === 0 && (
          <p className="font-mono text-[11px] text-muted-foreground">
            No handoffs yet.
          </p>
        )}
        {events.map((e) => (
          <p
            key={e.at + e.detail.slice(0, 24)}
            className={cn("font-mono text-[11px] break-words", EVENT_COLOR[e.kind])}
          >
            [{e.agent}] {e.name ? `${e.name}: ` : ""}
            {e.detail}
          </p>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AgentsLab() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <header className="shrink-0 border-b border-hairline px-4 py-3">
        <h1 className="text-[15px] font-semibold">Agents Lab</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          ax multi-agent orchestration over the house WebGPU kernels — chat,
          skill handoffs, and in-browser train/eval. Everything on this device.
        </p>
      </header>
      <div className="flex min-h-0 flex-1">
        <ConciergeChat />
        <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-hairline">
          <ActivityRail />
          <TriagePanel />
          <TrainerPanel />
        </aside>
      </div>
    </div>
  );
}
