/**
 * Browser-only OPFS SQLite storage for AccountBox product records.
 *
 * This module is intentionally a tiny message client. SQLite itself runs in a
 * module worker because @sqlite.org/sqlite-wasm only exposes the OPFS VFS off
 * the main thread under cross-origin isolation.
 *
 * Without COOP/COEP headers (a deployed server whose Caddy hasn't added them
 * yet) it falls back LOUDLY to the legacy OPFS JSON store — same API, same
 * data directory; the worker migrates the JSON store into SQLite on the
 * first isolated open. Never fail the vault because of a header.
 *
 * Private mail NEVER belongs here.
 * Server routes must not use this for product state.
 */
import {
  legacyJsonDelete,
  legacyJsonGet,
  legacyJsonList,
  legacyJsonOpen,
  legacyJsonPut,
} from "./opfs-legacy-json";

const WORKER_NAME = "accountbox-opfs-sqlite";

let warnedFallback = false;
function sqliteAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (window.crossOriginIsolated) return true;
  if (!warnedFallback) {
    warnedFallback = true;
    console.error(
      "[opfs] cross-origin isolation is OFF — falling back to the legacy OPFS JSON store. " +
        "Serve COOP: same-origin + COEP: credentialless to enable OPFS SQLite.",
    );
  }
  return false;
}

export type OpfsRecord<T = unknown> = {
  id: string;
  data: T;
  updatedAt: number;
};

type WorkerRequest = {
  id: number;
  method: "open" | "put" | "get" | "list" | "delete";
  args?: unknown[];
};

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();

function assertBrowser() {
  if (typeof window === "undefined") {
    throw new Error("OPFS SQLite is only available in the browser.");
  }
  if (!window.crossOriginIsolated) {
    throw new Error(
      "OPFS SQLite requires cross-origin isolation headers (COOP/COEP). Restart the dev server after dependency/header changes.",
    );
  }
}

function getWorker(): Worker {
  assertBrowser();
  if (worker) return worker;

  worker = new Worker(new URL("./opfs-sqlite.worker.ts", import.meta.url), {
    type: "module",
    name: WORKER_NAME,
  });
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.ok) {
      request.resolve(event.data.result);
    } else {
      request.reject(new Error(event.data.error));
    }
  });
  worker.addEventListener("error", (event) => {
    const message = event.message || "OPFS SQLite worker failed";
    for (const [id, request] of pending) {
      pending.delete(id);
      request.reject(new Error(message));
    }
  });
  return worker;
}

function callWorker<T>(
  method: WorkerRequest["method"],
  args: unknown[] = [],
): Promise<T> {
  const id = nextId++;
  const request: WorkerRequest = { id, method, args };
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    getWorker().postMessage(request);
  });
}

export async function opfsOpen() {
  if (!sqliteAvailable()) {
    await legacyJsonOpen();
    return { ok: true as const, storage: "opfs-json-legacy" as const };
  }
  return callWorker<{ ok: true; storage: "opfs-sqlite"; filename: string }>(
    "open",
  );
}

export async function opfsPut<T>(table: string, id: string, data: T) {
  if (!sqliteAvailable()) return legacyJsonPut(table, id, data);
  await callWorker("put", [table, id, data]);
}

export async function opfsGet<T>(table: string, id: string): Promise<T | null> {
  if (!sqliteAvailable()) return legacyJsonGet<T>(table, id);
  return callWorker<T | null>("get", [table, id]);
}

export async function opfsList<T>(
  table: string,
): Promise<Array<OpfsRecord<T>>> {
  if (!sqliteAvailable()) return legacyJsonList<T>(table);
  return callWorker<Array<OpfsRecord<T>>>("list", [table]);
}

export async function opfsDelete(table: string, id: string) {
  if (!sqliteAvailable()) return legacyJsonDelete(table, id);
  await callWorker("delete", [table, id]);
}

export async function __opfsProveRoundtrip() {
  if (typeof window === "undefined") throw new Error("Run in browser");
  await opfsOpen();
  const token = `phase1-${Math.random().toString(36).slice(2)}`;
  const payload = { token, at: Date.now(), storage: "opfs-sqlite" };
  await opfsPut("_phase1_proof", "record", payload);
  const back = await opfsGet<typeof payload>("_phase1_proof", "record");
  console.log("[OPFS SQLite Phase 1] wrote:", payload, "read back:", back);
  return back;
}
