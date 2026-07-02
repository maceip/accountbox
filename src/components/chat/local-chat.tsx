import { useState, useEffect, type FormEvent } from "react";
import { Bot, ChevronDown, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
// Use the real WebGPU + LoRA runtime (delegates to emberglass).
// This is the only allowed import for agent behavior going forward.
import {
  getAgentStatus,
  generate,
  loadBaseModel,
  equipAdapter,
  subscribeAgentStatus,
  isEquippedForRealInference,
  type AgentStatus,
} from "@/lib/runtime/gmail-agent-runtime";
import { recordAgentTrace } from "@/lib/agent/trace-recorder";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function LocalChat() {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const [status, setStatus] = useState<AgentStatus>(getAgentStatus());

  // Live status from the real runtime (subscribe once)
  useEffect(() => {
    const unsub = subscribeAgentStatus(setStatus);
    return unsub;
  }, []);

  // Auto-attempt to load the real tuned model (VibeThinker + Gmail LoRA) as soon as the chat is opened.
  // This is the core requirement: no more silent cold/target-replay. We want the trained weights.
  useEffect(() => {
    if (open && !isEquippedForRealInference()) {
      // Fire and forget; errors will be visible in status + lastError
      ensureRealEngine();
    }
  }, [open]);

  const ensureRealEngine = async () => {
    if (isEquippedForRealInference()) return;
    await loadBaseModel();
    try {
      await equipAdapter({ type: 'http', url: '/adapters/gmail-agent' });
    } catch (e) {
      console.warn('[local-chat] real equip failed, staying cold:', e);
    }
  };

  const forceEquipReal = async () => {
    setPending(true);
    try {
      await loadBaseModel();
      await equipAdapter({ type: 'http', url: '/adapters/gmail-agent' });
    } catch (e: any) {
      console.error('[local-chat] force equip failed', e);
    } finally {
      setPending(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setMessages(m => [...m, {role:"user", content:text}, {role:"assistant", content:""}]);
    setInput("");
    setPending(true);

    try {
      await ensureRealEngine();

      const plan = await generate(text);   // now returns Plan object (or safe cold fallback)

      const isCold = (plan as any).__cold === true;
      const isReal = !isCold && getAgentStatus().state === 'equipped';
      recordAgentTrace(text, 'tool' in plan ? [{ name: plan.tool, args: plan.args }] : (plan as any).steps?.map((s: any) => ({ name: s.tool, args: s.args })) || []);

      // Show the plan + attempt execution (token may be null until vault + Gmail connect)
      let result = isReal
        ? `REAL ENGINE — Plan: ${JSON.stringify(plan, null, 2)}`
        : `COLD (no weights) — Plan: ${JSON.stringify(plan, null, 2)}`;

      try {
        const mod = await import("@/lib/agent/real-gmail-tools");
        const exec = await mod.executePlan(plan);
        result = JSON.stringify({ plan, execution: exec }, null, 2);
      } catch (ex: any) {
        if (isCold || /cold|non-inference/i.test(String(ex?.message || ex))) {
          result = `COLD — refusing execution: ${(plan as any).__cold ? 'plan marked __cold' : (ex?.message || ex)}`;
        } else {
          result += `\n(Execution note: ${ex?.message || ex}. Connect a real Gmail account after vault unlock.)`;
        }
      }

      setMessages(curr => curr.map((m, i) => (i === curr.length - 1 ? { ...m, content: result } : m)));
    } finally {
      setPending(false);
    }
  };

  // Expose for console / testing the real serving path
  if (typeof window !== 'undefined') {
    (window as any).loadRealGmailLoRA = forceEquipReal;
    (window as any).isRealGmailEngine = isEquippedForRealInference;
  }

  if (!open) return <Button onClick={()=>setOpen(true)} className="fixed bottom-4 right-4">Local agent</Button>;

  const isReal = isEquippedForRealInference() || status.state === 'equipped';
  const statusLabel = isReal ? 'REAL (tuned)' : status.state === 'error' ? 'ERROR' : 'COLD (no weights)';

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] h-[460px] flex flex-col rounded border border-hairline bg-card shadow-xl">
      <header className="h-11 flex items-center gap-2 border-b px-3">
        <span className="size-6 rounded bg-primary text-on-primary flex items-center justify-center"><Bot className="size-3.5"/></span>
        <div className="flex-1">
          <p className="text-[13px] font-medium">Local agent (VibeThinker-3B + Gmail LoRA)</p>
          <p className={`text-[10px] ${isReal ? 'text-emerald-500' : 'text-amber-500'}`}>
            {statusLabel} {status.progress ? `· ${Math.round(status.progress.frac * 100)}%` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={forceEquipReal} disabled={pending} className="text-[10px] h-6 px-2">
          Load real LoRA
        </Button>
        {pending && <LoaderCircle className="size-4 animate-spin"/>}
        <Button variant="ghost" size="icon-sm" onClick={()=>setOpen(false)}><ChevronDown/></Button>
      </header>
      <div className="flex-1 overflow-auto p-3 text-[13px]">
        {messages.length === 0 && <div className="text-muted-foreground">Auto-loading real VibeThinker-3B + Gmail LoRA on open. When you see "REAL (tuned)" the plans come from the fine-tuned weights (no proxy). Errors and cold paths are shown explicitly.</div>}
        {status.lastError && (
          <div className="text-[10px] text-red-500 mb-2 border border-red-500/30 p-1 rounded">Last error: {status.lastError}</div>
        )}
        {messages.map((m,i) => <div key={i} className={cn("max-w-[88%] rounded p-2 mb-2 whitespace-pre-wrap", m.role==="user"?"ml-auto bg-primary text-on-primary":"bg-muted")}>{m.content}</div>)}
      </div>
      <form className="flex gap-2 border-t p-2" onSubmit={send}>
        <Textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();(e.currentTarget.form as any)?.requestSubmit();}}} placeholder="e.g. Find all unread from manager this week..." className="flex-1 text-[13px]"/>
        <Button size="icon" disabled={!input.trim()||pending}><Send/></Button>
      </form>
    </aside>
  );
}
