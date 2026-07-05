/**
 * The concierge LLM: the resident chat model (Qwen2.5-3B-Instruct on the
 * house Emberglass kernels) exposed to ax as an AxAIService.
 *
 * No new engine is created here — this wraps chat-runtime's already-loaded
 * engine via chatCompleteRaw, so GPU residency stays under the engine-slot
 * coordinator exactly as before. If the chat model isn't resident, forwards
 * throw (honest failure); callers load it through loadChatModel() first.
 *
 * supportsFunctions is false on purpose: the kernels have no native tool-call
 * API, so ax's functionCallMode "auto" resolves to prompt-mode calling —
 * tools are rendered into the prompt and calls are parsed from text. That is
 * the correct (and only honest) mode for a 3B instruct model.
 */

import type { AxAIService } from "@ax-llm/ax";
import {
  chatCompleteRaw,
  loadChatModel,
  type ChatTurn,
} from "@/lib/runtime/chat-runtime";
import { getAx } from "./ax-module";
import { axEngineFromChatComplete } from "./providers/emberglass-engine";

export const CONCIERGE_MODEL_ID = "qwen2.5-3b-instruct-emberglass";

let cached: AxAIService | null = null;

export async function getConciergeAI(): Promise<AxAIService> {
  if (cached) return cached;
  const { ai } = await getAx();
  // A handoff tool (skill planner / trainer) displaces the chat model from
  // the GPU mid-forward. Reclaim it before every model step: loadChatModel is
  // single-flight and a no-op while resident, so this only costs a real
  // reload after an actual displacement — which the activity rail surfaces.
  const engine = axEngineFromChatComplete(async (messages, opts) => {
    await loadChatModel();
    return chatCompleteRaw(messages as ChatTurn[], opts);
  });
  cached = ai({
    name: "webllm",
    engine,
    config: {
      model: CONCIERGE_MODEL_ID,
      supportsFunctions: false,
      stream: false,
      maxTokens: 512,
      temperature: 0.7,
    },
  });
  return cached;
}
