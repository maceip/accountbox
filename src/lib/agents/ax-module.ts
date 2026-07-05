/**
 * SSR-safe access to @ax-llm/ax.
 *
 * ax itself is isomorphic ESM, but everything in the agents layer is
 * browser-only by design (WebGPU engines, OPFS, Web Locks). Loading ax
 * lazily keeps it out of the server bundle and out of the initial client
 * chunk — the module only arrives when the Agents Lab actually runs.
 */

export type AxModule = typeof import("@ax-llm/ax");

let modInFlight: Promise<AxModule> | null = null;

export function getAx(): Promise<AxModule> {
  if (!modInFlight) modInFlight = import("@ax-llm/ax");
  return modInFlight;
}
