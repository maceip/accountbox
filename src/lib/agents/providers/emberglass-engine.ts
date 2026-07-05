/**
 * ax local-engine shim over the house WebGPU kernels (Emberglass).
 *
 * ax's `ai({ name: 'webllm', engine })` provider never imports @mlc-ai/web-llm —
 * `engine` is a STRUCTURAL interface: anything exposing
 * `engine.chat.completions.create(req)` in the OpenAI shape. This module turns a
 * plain `chatComplete(messages, opts) => Promise<string>` (what both AccountBox
 * runtimes already speak to Emberglass) into that shape, so ax orchestrates our
 * own VibeThinker-3B / Qwen2.5-3B kernels with zero foreign runtime and no HTTP.
 *
 * The kernels return a full string (chatComplete already drains the generator),
 * so streaming is emitted as a single terminal chunk — enough for ax's stream
 * accumulator; a true token stream can replace it later without touching callers.
 */

import type {
  AxAIWebLLMChatRequest,
  AxAIWebLLMChatResponse,
  AxAIWebLLMChatResponseDelta,
  AxAIWebLLMEngine,
} from "@ax-llm/ax";

export interface RawChatMessage {
  role: string;
  content: string;
}

export interface RawChatOpts {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
}

/** The one function an Emberglass-backed engine must provide. */
export type RawChatComplete = (
  messages: RawChatMessage[],
  opts?: RawChatOpts,
) => Promise<string>;

function flattenContent(
  content: AxAIWebLLMChatRequest["messages"][number]["content"],
): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return String(content);
}

function toRawMessages(req: AxAIWebLLMChatRequest): RawChatMessage[] {
  return req.messages.map((m) => ({
    role: m.role,
    content: flattenContent(m.content),
  }));
}

function toRawOpts(req: AxAIWebLLMChatRequest): RawChatOpts {
  return {
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.top_p !== undefined ? { topP: req.top_p } : {}),
    ...(req.max_tokens !== undefined ? { maxTokens: req.max_tokens } : {}),
  };
}

function buildResponse(
  req: AxAIWebLLMChatRequest,
  content: string,
): AxAIWebLLMChatResponse {
  return {
    id: `emberglass-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: req.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    // The kernels don't surface token counts; ax reads these with `?? 0`.
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function buildDeltaStream(
  req: AxAIWebLLMChatRequest,
  content: string,
): ReadableStream<AxAIWebLLMChatResponseDelta> {
  const id = `emberglass-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  return new ReadableStream<AxAIWebLLMChatResponseDelta>({
    start(controller) {
      controller.enqueue({
        id,
        object: "chat.completion.chunk",
        created,
        model: req.model,
        choices: [
          { index: 0, delta: { role: "assistant", content }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
      controller.close();
    },
  });
}

/**
 * Wrap a raw chatComplete as an ax WebLLM engine. Streaming and non-streaming
 * are both honored; both call the same underlying real inference.
 */
export function axEngineFromChatComplete(
  chatComplete: RawChatComplete,
): AxAIWebLLMEngine {
  return {
    chat: {
      completions: {
        create: async (request: Readonly<AxAIWebLLMChatRequest>) => {
          const text = await chatComplete(
            toRawMessages(request),
            toRawOpts(request),
          );
          if (request.stream) return buildDeltaStream(request, text);
          return buildResponse(request, text);
        },
      },
    },
  };
}
