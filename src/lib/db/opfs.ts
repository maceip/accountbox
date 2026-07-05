/**
 * OPFS-backed JSON storage for product records.
 *
 * This is NOT SQLite. It is the current browser-owned persistence shim:
 * Origin Private File System + one JSON document. Keep it honest until the
 * product-plan's real OPFS SQLite layer replaces this module.
 *
 * References studied: https://github.com/maceip/www-terminal , https://github.com/maceip/agent-browser
 *
 * Private mail NEVER written here.
 * Server routes must not use this for product state.
 */

const DB_NAME = "betterbox-product";
const STORE_FILE = "store.json";
const CURRENT_VERSION = 1;

export type OpfsRecord<T = unknown> = {
  id: string;
  data: T;
  updatedAt: number;
};

type StoreShape = {
  version: number;
  tables: Record<string, Record<string, OpfsRecord>>;
};

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (typeof window === "undefined" || !("storage" in navigator)) {
    throw new Error("OPFS is only available in the browser.");
  }
  if (!rootPromise) {
    rootPromise = (async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(DB_NAME, { create: true });
    })();
  }
  return rootPromise;
}

async function readStore(dir: FileSystemDirectoryHandle): Promise<StoreShape> {
  try {
    const fileHandle = await dir.getFileHandle(STORE_FILE, { create: true });
    const file = await fileHandle.getFile();
    if (file.size === 0) return { version: CURRENT_VERSION, tables: {} };
    const text = await file.text();
    const parsed = JSON.parse(text) as StoreShape;
    return parsed.version === CURRENT_VERSION
      ? parsed
      : { version: CURRENT_VERSION, tables: parsed.tables ?? {} };
  } catch {
    return { version: CURRENT_VERSION, tables: {} };
  }
}

async function writeStore(dir: FileSystemDirectoryHandle, store: StoreShape) {
  const fileHandle = await dir.getFileHandle(STORE_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(store));
  await writable.close();
}

export async function opfsOpen() {
  const dir = await getRoot();
  await readStore(dir);
  return { ok: true as const };
}

export async function opfsPut<T>(table: string, id: string, data: T) {
  const dir = await getRoot();
  const store = await readStore(dir);
  if (!store.tables[table]) store.tables[table] = {};
  store.tables[table][id] = { id, data, updatedAt: Date.now() };
  await writeStore(dir, store);
}

export async function opfsGet<T>(table: string, id: string): Promise<T | null> {
  const dir = await getRoot();
  const store = await readStore(dir);
  return (store.tables[table]?.[id]?.data as T) ?? null;
}

export async function opfsList<T>(
  table: string,
): Promise<Array<OpfsRecord<T>>> {
  const dir = await getRoot();
  const store = await readStore(dir);
  return Object.values(store.tables[table] ?? {}) as Array<OpfsRecord<T>>;
}

export async function opfsDelete(table: string, id: string) {
  const dir = await getRoot();
  const store = await readStore(dir);
  if (store.tables[table]) {
    delete store.tables[table][id];
    await writeStore(dir, store);
  }
}

export async function __opfsProveRoundtrip() {
  if (typeof window === "undefined") throw new Error("Run in browser");
  await opfsOpen();
  const token = `phase1-${Math.random().toString(36).slice(2)}`;
  const payload = { token, at: Date.now() };
  await opfsPut("_phase1_proof", "record", payload);
  const back = await opfsGet("_phase1_proof", "record");
  console.log("[OPFS Phase 1] wrote:", payload, "read back:", back);
  return back;
}
