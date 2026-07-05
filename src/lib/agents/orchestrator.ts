/**
 * The ax multi-agent layer: one Concierge chat agent orchestrating two
 * specialist hands, all in-browser on the house WebGPU kernels.
 *
 *  - Concierge — Qwen2.5-3B-Instruct (chat-runtime) behind an ax program with
 *    prompt-mode function calling. It talks to the user and hands work off by
 *    calling typed tools.
 *  - Skill planner — VibeThinker-3B + task LoRA. NOT wrapped as an ax LLM:
 *    its system prompt is byte-locked to its training data and its output
 *    goes through plan-parse's honest extraction, so the handoff tool calls
 *    the existing skill runtime (real inference, __cold refusal, whitelist)
 *    and returns the plan as data.
 *  - Trainer — drives train-runtime (real AdamW LoRA steps, held-out eval,
 *    OPFS export/equip) through typed tools.
 *
 * GPU residency: only one 3B engine fits, so a handoff displaces the chat
 * model. The concierge engine auto-reloads it before its next forward step
 * (loadChatModel is single-flight and a no-op when resident) — swaps are
 * real and visible in the activity rail, never hidden.
 *
 * Runtime codegen (ax's RLM `agent()` + AxJSRuntime) is deliberately NOT
 * used: docs/tool-synthesis-research.md showed 3B-class models can't be
 * trusted to write executable code at runtime. Tools here are fixed, typed,
 * and validated — the model only chooses among them.
 */

import type { AxFunction } from "@ax-llm/ax";
import { loadChatModel } from "@/lib/runtime/chat-runtime";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import { GMAIL_SKILL } from "@/lib/skills/gmail/skill";
import { getAx } from "./ax-module";
import { getConciergeAI } from "./concierge-ai";
import {
  BBTRIAGE_ADAPTER_URL,
  BBTRIAGE_DATASET,
  extractTriageVerdict,
} from "./bbtriage";
import {
  equipAdapterOnTrainer,
  exportTrainedAdapter,
  grpoHeldoutAccuracy,
  loadGrpoDataset,
  loadTrainerBase,
  loadTrainerDataset,
  runEval,
  runGrpo,
  runTraining,
  trainerGenerate,
} from "./train-runtime";

// ---------------------------------------------------------------------------
// Activity events (the "agent activity" rail subscribes here)
// ---------------------------------------------------------------------------

export interface AgentEvent {
  at: number;
  agent: "concierge" | "skill-planner" | "trainer" | "system";
  kind: "tool_call" | "tool_result" | "error" | "status";
  name?: string;
  detail: string;
}

let events: AgentEvent[] = [];
const eventListeners = new Set<(e: AgentEvent[]) => void>();

export function pushAgentEvent(e: Omit<AgentEvent, "at">): void {
  events = [...events, { ...e, at: Date.now() }];
  for (const l of eventListeners) l(events);
}

export function getAgentEvents(): AgentEvent[] {
  return events;
}

export function subscribeAgentEvents(
  listener: (e: AgentEvent[]) => void,
): () => void {
  eventListeners.add(listener);
  listener(events);
  return () => eventListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Byte-locked bbtriage system prompt — read from the dataset, never re-typed
// ---------------------------------------------------------------------------

let bbtriageSystemPrompt: string | null = null;

export async function getBbtriageSystemPrompt(): Promise<string> {
  if (bbtriageSystemPrompt) return bbtriageSystemPrompt;
  const res = await fetch(BBTRIAGE_DATASET.heldout);
  if (!res.ok)
    throw new Error(`cannot read bbtriage dataset (${res.status}) for system prompt`);
  const firstLine = (await res.text()).split("\n").find((l) => l.trim());
  if (!firstLine) throw new Error("bbtriage dataset is empty");
  const ex = JSON.parse(firstLine) as {
    messages: Array<{ role: string; content: string }>;
  };
  const sys = ex.messages.find((m) => m.role === "system")?.content;
  if (!sys) throw new Error("bbtriage dataset has no system message");
  bbtriageSystemPrompt = sys;
  return sys;
}

// ---------------------------------------------------------------------------
// Specialist entry points (also used directly by the panel UI + E2E)
// ---------------------------------------------------------------------------

/** Handoff: Gmail skill planner (VibeThinker + gmail LoRA, plan-parse path). */
export async function runGmailPlanner(task: string): Promise<string> {
  pushAgentEvent({
    agent: "skill-planner",
    kind: "status",
    detail: "handoff: loading VibeThinker-3B + gmail LoRA (displaces chat model)",
  });
  const rt = getSkillRuntime(GMAIL_SKILL);
  if (!rt.isEquippedForRealInference()) {
    const adapterPath = GMAIL_SKILL.adapterUrl ?? `/adapters/${GMAIL_SKILL.id}`;
    await rt.equipAdapter({ type: "local-path", path: adapterPath });
  }
  const plan = await rt.generate(task);
  if ("__cold" in plan && plan.__cold) {
    const raw = "raw" in plan && plan.raw ? ` raw: ${plan.raw}` : "";
    pushAgentEvent({
      agent: "skill-planner",
      kind: "error",
      detail: `refused: no valid plan from real inference.${raw}`,
    });
    return `REFUSED: the skill model did not produce a valid plan.${raw}`;
  }
  const json = JSON.stringify(plan);
  pushAgentEvent({ agent: "skill-planner", kind: "tool_result", detail: json });
  return json;
}

/** Handoff: bbtriage (VibeThinker + bbtriage LoRA on the training session). */
export async function runBbtriage(report: string): Promise<string> {
  pushAgentEvent({
    agent: "skill-planner",
    kind: "status",
    detail: "handoff: loading VibeThinker-3B + bbtriage LoRA (displaces chat model)",
  });
  await loadTrainerBase();
  await equipAdapterOnTrainer({ url: BBTRIAGE_ADAPTER_URL });
  const system = await getBbtriageSystemPrompt();
  const text = await trainerGenerate(
    [
      { role: "system", content: system },
      { role: "user", content: report },
    ],
    { maxTokens: 768, temperature: 0 },
  );
  const result = extractTriageVerdict(text);
  if (!result.ok) {
    pushAgentEvent({
      agent: "skill-planner",
      kind: "error",
      detail: `refused: ${result.error}. raw: ${result.raw.slice(0, 200)}`,
    });
    return `REFUSED: ${result.error}`;
  }
  const json = JSON.stringify(result.verdict);
  pushAgentEvent({ agent: "skill-planner", kind: "tool_result", detail: json });
  return json;
}

// ---------------------------------------------------------------------------
// Concierge tools (typed fn() definitions the chat model can call)
// ---------------------------------------------------------------------------

async function buildTools(): Promise<AxFunction[]> {
  const { fn, f } = await getAx();
  const logCall = (agent: AgentEvent["agent"], name: string, args: unknown) =>
    pushAgentEvent({
      agent,
      kind: "tool_call",
      name,
      detail: JSON.stringify(args).slice(0, 300),
    });

  const gmailPlan = fn("gmail_plan")
    .description(
      "Hand a Gmail task (search mail, read a message, draft a reply) to the fine-tuned Gmail skill model. Returns the tool plan as JSON, or REFUSED.",
    )
    .arg("task", f.string("The Gmail task in plain language"))
    .returns(f.string("Plan JSON or refusal"))
    .handler(async ({ task }) => {
      logCall("concierge", "gmail_plan", { task });
      return runGmailPlanner(task);
    })
    .build();

  const triage = fn("triage_report")
    .description(
      "Hand a bug bounty submission to the fine-tuned triage model. Returns a JSON verdict (disposition, severity, reasoning), or REFUSED.",
    )
    .arg("report", f.string("The full researcher submission text"))
    .returns(f.string("Triage verdict JSON or refusal"))
    .handler(async ({ report }) => {
      logCall("concierge", "triage_report", { report: report.slice(0, 80) });
      return runBbtriage(report);
    })
    .build();

  const trainerLoad = fn("trainer_load")
    .description(
      "Trainer: load the base model and the bbtriage dataset for in-browser training. Must run before trainer_train.",
    )
    .returns(f.string("Dataset summary"))
    .handler(async () => {
      logCall("trainer", "trainer_load", {});
      await loadTrainerBase();
      const s = await loadTrainerDataset(
        BBTRIAGE_DATASET.train,
        BBTRIAGE_DATASET.heldout,
      );
      const msg = `dataset ready: ${s.train} train / ${s.heldout} heldout (${s.skipped} skipped)`;
      pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
      return msg;
    })
    .build();

  const trainerTrain = fn("trainer_train")
    .description(
      "Trainer: run training on the loaded dataset. algorithm 'sft' (default) does supervised AdamW LoRA steps; 'grpo' does group-relative policy optimization with the verifiable bbtriage reward. Returns a progress summary.",
    )
    .arg("steps", f.number("SFT optimizer steps / GRPO iterations (e.g. 20 / 8)").optional())
    .arg("algorithm", f.string("'sft' or 'grpo'").optional())
    .returns(f.string("Training summary"))
    .handler(async ({ steps, algorithm }) => {
      logCall("trainer", "trainer_train", { steps, algorithm });
      if (algorithm === "grpo") {
        await loadGrpoDataset(BBTRIAGE_DATASET.train, BBTRIAGE_DATASET.heldout);
        const r = await runGrpo({
          iterations: steps ?? 8,
          warmStartUrl: BBTRIAGE_ADAPTER_URL,
        });
        const msg = `GRPO ${r.iterations} iters: mean reward ${r.firstReward.toFixed(3)} -> ${r.lastReward.toFixed(3)}`;
        pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
        return msg;
      }
      const r = await runTraining({ steps: steps ?? 20 });
      const msg = `trained ${r.steps} steps: loss ${r.firstLoss.toFixed(4)} -> ${r.lastLoss.toFixed(4)}`;
      pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
      return msg;
    })
    .build();

  const trainerAccuracy = fn("trainer_accuracy")
    .description(
      "Trainer: measure held-out bbtriage disposition accuracy under the current adapter (greedy decode). Useful after GRPO.",
    )
    .arg("samples", f.number("Held-out examples to score (e.g. 8)").optional())
    .returns(f.string("Accuracy result"))
    .handler(async ({ samples }) => {
      logCall("trainer", "trainer_accuracy", { samples });
      const r = await grpoHeldoutAccuracy(samples ?? 8);
      const msg = `heldout disposition accuracy: ${(r.accuracy * 100).toFixed(1)}% over ${r.n} examples`;
      pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
      return msg;
    })
    .build();

  const trainerEval = fn("trainer_eval")
    .description(
      "Trainer: measure mean held-out loss. mode 'base' evaluates the raw base model, 'trained' evaluates the current adapter.",
    )
    .arg("mode", f.string("'base' or 'trained'"))
    .returns(f.string("Eval result"))
    .handler(async ({ mode }) => {
      logCall("trainer", "trainer_eval", { mode });
      const r = await runEval(mode, { base: mode === "base" });
      const msg = `heldout ${mode}: mean loss ${r.meanLoss.toFixed(4)} over ${r.examples} examples`;
      pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
      return msg;
    })
    .build();

  const trainerExport = fn("trainer_export")
    .description(
      "Trainer: export the trained LoRA adapter (PEFT safetensors) to browser storage (OPFS).",
    )
    .arg("name", f.string("Adapter name"))
    .returns(f.string("Export result"))
    .handler(async ({ name }) => {
      logCall("trainer", "trainer_export", { name });
      const r = await exportTrainedAdapter(name);
      const msg = `exported "${r.name}" (${r.safetensorsBytes} bytes) to OPFS`;
      pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
      return msg;
    })
    .build();

  const trainerEquip = fn("trainer_equip")
    .description(
      "Trainer: hot-swap a stored adapter (by OPFS name) onto the resident model.",
    )
    .arg("name", f.string("Adapter name in OPFS"))
    .returns(f.string("Equip result"))
    .handler(async ({ name }) => {
      logCall("trainer", "trainer_equip", { name });
      const r = await equipAdapterOnTrainer({ opfsName: name });
      const msg = `equipped ${r.label} (${r.modules} modules)`;
      pushAgentEvent({ agent: "trainer", kind: "tool_result", detail: msg });
      return msg;
    })
    .build();

  return [
    gmailPlan,
    triage,
    trainerLoad,
    trainerTrain,
    trainerAccuracy,
    trainerEval,
    trainerExport,
    trainerEquip,
  ] as AxFunction[];
}

// ---------------------------------------------------------------------------
// Concierge turn
// ---------------------------------------------------------------------------

const CONCIERGE_DESCRIPTION =
  "You are the AccountBox concierge, a local assistant running fully on this device. " +
  "You can answer directly, or hand work to specialists via the available tools: " +
  "the Gmail skill model (gmail_plan), the bug bounty triage model (triage_report), " +
  "and the in-browser trainer (trainer_*, including GRPO via trainer_train " +
  "algorithm 'grpo'). Use a tool when the user asks for that " +
  "kind of work; otherwise just answer. Be concise.";

export interface ConciergeTurnResult {
  reply: string;
}

/**
 * One concierge exchange. `history` is the prior transcript rendered as text
 * (the 3B model handles a compact transcript better than a long message
 * array under prompt-mode tool calling).
 */
export async function runConciergeTurn(
  userMessage: string,
  history: string,
): Promise<ConciergeTurnResult> {
  await loadChatModel();
  const { ax } = await getAx();
  const llm = await getConciergeAI();
  const tools = await buildTools();
  const program = ax(
    "chatHistory:string \"Prior conversation, may be empty\", userMessage:string -> assistantReply:string",
  );
  const res = await program.forward(
    llm,
    { chatHistory: history || "(none)", userMessage },
    {
      description: CONCIERGE_DESCRIPTION,
      functions: tools,
      functionCallMode: "prompt",
      maxSteps: 4,
      maxRetries: 1,
    },
  );
  return { reply: String(res.assistantReply ?? "") };
}
