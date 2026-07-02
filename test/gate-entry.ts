// Browser entry for the automated WebGPU gate.
// Imports the REAL accountbox runtime (which delegates to emberglass), loads the
// base model + Gmail LoRA same-origin, and runs the synthetic prompts through
// actual weights. It logs structured `GATE {...}` lines that the node runner
// (test/run_gate.mjs) scrapes from the Chrome console. No replay, no fakery.
import {
  equipAdapter,
  generate,
  getAgentStatus,
  isEquippedForRealInference,
} from "../src/lib/runtime/gmail-agent-runtime";
import promptData from "../training/gmail-synthetic-prompts.json";

const ALLOWED = ["search_messages", "read_message", "create_draft"];

function emit(obj: unknown) {
  console.log("GATE " + JSON.stringify(obj));
}

function toolsOf(plan: any): string[] {
  if (!plan) return [];
  if (plan.tool) return [plan.tool];
  if (Array.isArray(plan.steps)) return plan.steps.map((s: any) => s.tool).filter(Boolean);
  return [];
}

async function main() {
  const prompts = (promptData as any).prompts as Array<{ prompt: string; expected_tools?: string[] }>;
  emit({ type: "start", ts: Date.now(), promptCount: prompts.length });
  try {
    // equipAdapter builds base+LoRA in one weight stream (no separate base load)
    emit({ type: "phase", phase: "equipAdapter" });
    await equipAdapter({ type: "http", url: "/adapters/gmail-agent" });
    emit({ type: "equipped", equipped: isEquippedForRealInference(), status: getAgentStatus().state });

    for (let i = 0; i < prompts.length; i++) {
      const p = prompts[i];
      const plan: any = await generate(p.prompt);
      const tools = toolsOf(plan);
      emit({
        type: "plan",
        i,
        prompt: p.prompt,
        cold: plan && plan.__cold === true,
        ran: plan && plan.__ran === true,
        raw: plan && plan.raw ? String(plan.raw).slice(0, 220) : undefined,
        tools,
        allowed: tools.length > 0 && tools.every((t) => ALLOWED.includes(t)),
        expected: p.expected_tools || [],
        plan,
      });
    }
    emit({ type: "done" });
  } catch (e: any) {
    emit({ type: "error", message: String((e && e.message) || e), stack: String((e && e.stack) || "").slice(0, 600) });
  }
}

main();
