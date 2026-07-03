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
  window.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url || "";
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
        console.warn(`[weight-fetch] retry ${attempt + 1}/6 in ${delay}ms:`, String(e).slice(0, 120));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }) as typeof window.fetch;
}

/** Dynamic import of the real engine. `emberglass` is a DECLARED file:
 *  dependency (package.json -> ../emberglass), so the coupling is visible in
 *  one place and `bun install` fails loudly if the engine checkout is missing. */
export async function getEmberglass() {
  // @ts-ignore - external ESM, no .d.ts
  const mod = await import('emberglass/src/emberglass_bridge.js');
  return mod;
}
