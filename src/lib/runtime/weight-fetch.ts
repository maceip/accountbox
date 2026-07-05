/**
 * Weight-fetch retry, shared by both runtimes (skill + chat).
 *
 * The engine streams multi-GB weights as thousands of Range fetches; over a
 * real network ONE transient drop used to kill the entire load. Emberglass is
 * consumed as-is, so the retry lives here: a scoped wrapper around global
 * fetch that retries weight/adapter requests with backoff. Installed once.
 */

const WEIGHT_PATHS = ["/model/", "/model-chat/", "/adapters/"];

let installed = false;

export function installWeightFetchRetry() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    const isWeights = WEIGHT_PATHS.some((p) => url.includes(p));
    if (!isWeights) return orig(input, init);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await orig(input, init);
        if (res.status >= 500) throw new Error(`server ${res.status}`);
        return res;
      } catch (e) {
        lastErr = e;
        const delay = Math.min(500 * 2 ** attempt, 8000);
        console.warn(
          `[weight-fetch] retry ${attempt + 1}/6 in ${delay}ms:`,
          String(e).slice(0, 120),
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }) as typeof window.fetch;
}

/** The slice of the emberglass bridge both runtimes consume. The bridge ships
 *  no .d.ts, so this is the one place its shape is declared. */
export type EmberglassEngine = {
  label?: string;
  dispose?: () => void;
  chatComplete: (
    messages: Array<{ role: string; content: string }>,
    opts?: {
      temperature?: number;
      topK?: number;
      topP?: number;
      maxTokens?: number;
    },
  ) => Promise<string>;
};

export type EmberglassModule = {
  createEmberglassEngine: (opts: {
    modelUrl: string;
    hfRepo: string;
    loraUrl?: string;
    log?: (m: string) => void;
    onProgress?: (m: string, frac: number) => void;
  }) => Promise<EmberglassEngine>;
};

/** Dynamic import of the real engine. The engine is vendored in-repo at
 *  `src/engine/` (formerly a sibling emberglass checkout) so the whole
 *  system is self-contained inside this repository. */
export async function getEmberglass(): Promise<EmberglassModule> {
  // @ts-expect-error - plain-JS engine module, no .d.ts
  const mod = await import("@/engine/emberglass_bridge.js");
  return mod as EmberglassModule;
}
