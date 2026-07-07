/**
 * Adapter persistence in OPFS — files only, ZERO SQLite dependency. Binaries
 * live under accountbox-adapters/<name>/ with an info.json beside them.
 *
 * Why no SQLite here: adapters are exported right after training, while the
 * GPU + main thread are still saturated — exactly when sqlite-wasm's OPFS
 * VFS (SharedArrayBuffer/Atomics proxy) starts timing out with
 * SQLITE_IOERR_WRITE (GRPO e2e, 2026-07-07). Plain OPFS file writes don't go
 * through that proxy and survive the load.
 *
 * Reads fall back to the legacy SQLite records ("adapters"/"adapter-files",
 * base64) so adapters exported before 2026-07-07 still load.
 */
import { opfsGet, opfsList } from "@/lib/db/opfs";
import type { FileLike } from "./gmail-agent-runtime";

export interface StoredAdapterInfo {
  name: string;
  fileNames: string[];
  savedAt: number;
  /** "files" = real OPFS files; absent/legacy = base64 records. */
  storage?: "files";
}

const ADAPTER_DIR = "accountbox-adapters";

function safeName(name: string): string {
  if (!name || /[/\\]/.test(name)) {
    throw new Error(`invalid adapter name: "${name}"`);
  }
  return name;
}

async function adapterDir(
  name: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(ADAPTER_DIR, { create });
  return base.getDirectoryHandle(safeName(name), { create });
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const INFO_FILE = "info.json";

export async function saveAdapter(
  name: string,
  files: FileLike[],
): Promise<void> {
  const dir = await adapterDir(name, true);
  const fileNames: string[] = [];
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const handle = await dir.getFileHandle(f.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(buf);
    await writable.close();
    fileNames.push(f.name);
  }
  const info: StoredAdapterInfo = {
    name,
    fileNames,
    savedAt: Date.now(),
    storage: "files",
  };
  const infoHandle = await dir.getFileHandle(INFO_FILE, { create: true });
  const w = await infoHandle.createWritable();
  await w.write(JSON.stringify(info));
  await w.close();
}

async function readInfoFile(name: string): Promise<StoredAdapterInfo | null> {
  try {
    const dir = await adapterDir(name, false);
    const handle = await dir.getFileHandle(INFO_FILE);
    const text = await (await handle.getFile()).text();
    return JSON.parse(text) as StoredAdapterInfo;
  } catch {
    return null;
  }
}

async function readStoredFile(
  info: StoredAdapterInfo,
  fileName: string,
): Promise<ArrayBuffer | null> {
  if (info.storage === "files") {
    try {
      const dir = await adapterDir(info.name, false);
      const handle = await dir.getFileHandle(fileName);
      return await (await handle.getFile()).arrayBuffer();
    } catch {
      return null;
    }
  }
  // Legacy base64-record format (pre 2026-07-07 exports).
  const rec = await opfsGet<{ name: string; b64: string }>(
    "adapter-files",
    `${info.name}::${fileName}`,
  );
  return rec?.b64 ? b64ToBuf(rec.b64) : null;
}

export async function loadAdapterFiles(name: string): Promise<FileLike[]> {
  let info = await readInfoFile(name);
  if (!info) {
    // Legacy: metadata row in the SQLite record store (pre 2026-07-07).
    info = await opfsGet<StoredAdapterInfo>("adapters", name).catch(() => null);
  }
  if (!info) throw new Error(`No stored adapter named "${name}"`);
  const out: FileLike[] = [];
  for (const fn of info.fileNames) {
    const buf = await readStoredFile(info, fn);
    if (!buf) continue;
    out.push({
      name: fn,
      async text() {
        return new TextDecoder().decode(new Uint8Array(buf));
      },
      async arrayBuffer() {
        return buf.slice(0);
      },
    });
  }
  if (!out.length) throw new Error(`No files recovered for adapter "${name}"`);
  return out;
}

export async function listAdapters(): Promise<string[]> {
  const names = new Set<string>();
  try {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle(ADAPTER_DIR);
    for await (const [entryName, handle] of base as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind === "directory") names.add(entryName);
    }
  } catch {
    // No adapter dir yet — fine.
  }
  // Legacy SQLite records (pre 2026-07-07 exports). Best-effort: the record
  // store being unavailable must not hide file-based adapters.
  const recs = await opfsList<StoredAdapterInfo>("adapters").catch(() => []);
  for (const r of recs) if (r.data?.name) names.add(r.data.name);
  return [...names];
}
