import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftIcon, LoaderCircle, Send } from "lucide-react";
import { completeJourneyStep, type StepState } from "@/lib/journey/journey";
import {
  chat,
  getChatStatus,
  loadChatModel,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
  type ChatStatus,
  type ChatTurn,
} from "@/lib/runtime/chat-runtime";
import {
  connectionAllowsAutoload,
  probeAgentSupport,
} from "@/lib/runtime/agent-preload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WavyLinearProgress } from "@/components/ui/wavy-progress";
import { cn } from "@/lib/utils";

export function useChatStatus(): ChatStatus {
  const [status, setStatus] = useState<ChatStatus>(getChatStatus());
  useEffect(() => subscribeChatStatus(setStatus), []);
  return status;
}

/**
 * Journey step 1 — start your local model.
 *
 * Streams the REAL chat model (Qwen2.5-3B-Instruct) onto the GPU with the
 * same capability/connection gates the agent preload uses, then opens an
 * inline chat. The step completes on the first successful exchange — an
 * actual reply from actual weights, not a timer.
 */
export function StepChat({
  state,
  onBack,
}: {
  state: StepState;
  onBack: () => void;
}) {
  const status = useChatStatus();
  const [gate, setGate] = useState<
    "probing" | "unsupported" | "deferred" | "go"
  >("probing");
  const [unsupportedReason, setUnsupportedReason] = useState<string>("");

  useEffect(() => {
    let alive = true;
    probeAgentSupport().then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setUnsupportedReason(r.reason);
        setGate("unsupported");
        return;
      }
      setGate(connectionAllowsAutoload() === "defer" ? "deferred" : "go");
    });
    return () => {
      alive = false;
    };
  }, []);

  // Auto-start the weight stream once gates clear (idempotent single-flight).
  useEffect(() => {
    if (gate === "go") loadChatModel().catch(() => {});
  }, [gate]);

  const ready = status.state === "ready";
  const loading = status.state === "loading";
  const frac = status.progress?.frac;

  return (
    <div
      className="w-full rounded border border-hairline bg-surface-1 p-6"
      data-journey-screen="chat-agent"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-3" /> all steps
      </button>
      <h2 className="text-[20px] font-semibold">Start your local model</h2>
      <p className="mt-1 text-[12px] leading-normal text-ink-subtle">
        {CHAT_MODEL_LABEL} streams onto{" "}
        <strong className="text-ink">this machine's GPU</strong> and stays
        there. Prompts and replies never leave this device.
      </p>

      {gate === "unsupported" && (
        <p className="mt-4 rounded border border-hairline p-3 font-mono text-[11px] text-ink-subtle">
          This device can't run the local agent ({unsupportedReason}). Go back
          and choose "Continue without the agent".
        </p>
      )}

      {gate === "deferred" && !ready && !loading && (
        <div className="mt-4 flex flex-col gap-2 rounded border border-hairline p-3">
          <p className="font-mono text-[11px] text-ink-subtle">
            You're on a metered connection and the model is a large download —
            start it now, or come back on Wi-Fi.
          </p>
          <Button
            size="sm"
            className="self-start"
            onClick={() => loadChatModel().catch(() => {})}
          >
            Start download
          </Button>
        </div>
      )}

      {status.state === "error" && (
        <div className="mt-4 flex flex-col gap-2 rounded border border-destructive/30 p-3">
          <p className="font-mono text-[10px] text-destructive">
            {status.lastError}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => loadChatModel().catch(() => {})}
          >
            Retry
          </Button>
        </div>
      )}

      {loading && (
        <div
          className="mt-4 flex items-center gap-3"
          data-chat-model-state="loading"
        >
          <WavyLinearProgress
            value={frac !== undefined ? frac * 100 : undefined}
            width={220}
            strokeWidth={3}
            amplitude={2.5}
            wavelength={28}
            className="shrink-0 text-primary"
            aria-label="Streaming chat model"
          />
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-subtle">
            {frac !== undefined ? `${Math.round(frac * 100)}%` : "…"}
          </span>
        </div>
      )}
      {loading && status.progress?.message && (
        <p className="mt-1 truncate font-mono text-[10px] text-ink-muted">
          {status.progress.message}
        </p>
      )}

      {ready && <InlineChat done={state === "done"} onBack={onBack} />}
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

/** Minimal chat panel — same bubble chrome as AgentChat, no plans, no tools.
 *  The reply is the model's text, verbatim. */
function InlineChat({ done, onBack }: { done: boolean; onBack: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [exchanged, setExchanged] = useState(done);
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: message count / pending are scroll triggers, not read inside; the ref is stable.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, pending]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    const history: ChatTurn[] = [
      ...messages.map(
        (m) => ({ role: m.role, content: m.content }) as ChatTurn,
      ),
      { role: "user", content: text },
    ];
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setPending(true);
    try {
      const reply = await chat(history);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (reply.trim()) {
        // The real thing happened: weights produced a reply. Step earned.
        completeJourneyStep("chat-agent");
        setExchanged(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `(error: ${msg})` },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col" data-chat-model-state="ready">
      <div
        ref={scrollRef}
        className="flex h-[260px] flex-col gap-2 overflow-y-auto rounded border border-hairline p-3 text-[13px]"
      >
        {messages.length === 0 && (
          <p className="text-muted-foreground">
            Your model is live. Say anything — this reply is computed right
            here, on your GPU.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log, never reordered.
            key={i}
            className={cn(
              "max-w-[88%] rounded p-2 whitespace-pre-wrap",
              m.role === "user"
                ? "ml-auto bg-primary text-on-primary"
                : "bg-muted",
            )}
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={send}>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          placeholder="Say hello to your local model…"
          className="flex-1 text-[13px]"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || pending}
          aria-label="Send"
        >
          <Send />
        </Button>
      </form>
      {exchanged && (
        <Button className="mt-3 self-end" onClick={onBack} data-journey-advance>
          Step complete — continue
        </Button>
      )}
    </div>
  );
}
