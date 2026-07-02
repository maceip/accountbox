import { opfsOpen, opfsPut, opfsGet, opfsList } from "@/lib/db/opfs";
import type { FileLike } from "./gmail-agent-runtime";

export interface StoredAdapterInfo {
  name: string;
  fileNames: string[];
  savedAt: number;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function saveAdapter(name: string, files: FileLike[]): Promise<void> {
  await opfsOpen();
  const fileNames: string[] = [];
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const b64 = bufToB64(buf);
    const id = `${name}::${f.name}`;
    await opfsPut("adapter-files", id, { name: f.name, b64, size: buf.byteLength });
    fileNames.push(f.name);
  }
  const info: StoredAdapterInfo = { name, fileNames, savedAt: Date.now() };
  await opfsPut("adapters", name, info);
}

export async function loadAdapterFiles(name: string): Promise<FileLike[]> {
  await opfsOpen();
  const info = await opfsGet<StoredAdapterInfo>("adapters", name);
  if (!info) throw new Error(`No stored adapter named "${name}"`);
  const out: FileLike[] = [];
  for (const fn of info.fileNames) {
    const rec = await opfsGet<{ name: string; b64: string }>("adapter-files", `${name}::${fn}`);
    if (!rec?.b64) continue;
    const buf = b64ToBuf(rec.b64);
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
  await opfsOpen();
  const recs = await opfsList<StoredAdapterInfo>("adapters");
  return recs.map((r) => r.data.name).filter(Boolean);
}
