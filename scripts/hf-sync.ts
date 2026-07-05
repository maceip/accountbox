#!/usr/bin/env bun
/**
 * Sync heavy artifacts with the project's Hugging Face repo.
 *
 *   bun run hf:upload    — create macmacmacmac/accountbox (private) if missing
 *                          and upload weights, adapters, and source datasets.
 *   bun run fetch:models — download everything back into place. A fresh git
 *                          clone plus this one command is a working system.
 *
 * Repo layout on HF (one private model repo named after the project):
 *   model/                    VibeThinker-3B weights (skill base)
 *   model-chat/               Qwen2.5-3B-Instruct weights (chat model)
 *   adapters/gmail-agent/     trained LoRA (safetensors + configs)
 *   adapters/bbtriage/        trained LoRA (safetensors + configs)
 *   datasets/bbtriage/sft_v1/ full bbtriage SFT splits (train/valid/test)
 *
 * Auth: HF_TOKEN in .env (write scope). Never committed.
 */
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRepo, uploadFilesWithProgress, listFiles, downloadFile } from "@huggingface/hub";

const REPO = { type: "model" as const, name: "macmacmacmac/accountbox" };
const ROOT = process.cwd();

/** local dir -> path prefix inside the HF repo */
const MOUNTS: Array<{ local: string; remote: string }> = [
  { local: "model", remote: "model" },
  { local: "model-chat", remote: "model-chat" },
  { local: "public/adapters/gmail-agent", remote: "adapters/gmail-agent" },
  { local: "public/adapters/bbtriage", remote: "adapters/bbtriage" },
  { local: "data/bbtriage/sft_v1", remote: "datasets/bbtriage/sft_v1" },
];

function token(): string {
  const t = process.env.HF_TOKEN;
  if (!t) throw new Error("HF_TOKEN missing — run via `bun --env-file=.env`");
  return t;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name !== ".DS_Store") yield p;
  }
}

async function ensureRepo(accessToken: string) {
  try {
    await createRepo({ repo: REPO, accessToken, private: true });
    console.log(`created private repo ${REPO.name}`);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("already") || msg.includes("409")) {
      console.log(`repo ${REPO.name} already exists`);
    } else throw e;
  }
}

async function upload() {
  const accessToken = token();
  await ensureRepo(accessToken);
  for (const { local, remote } of MOUNTS) {
    const dir = join(ROOT, local);
    if (!existsSync(dir)) {
      console.warn(`skip ${local} — missing locally`);
      continue;
    }
    const files = [...walk(dir)].map((abs) => ({
      path: `${remote}/${abs.slice(dir.length + 1)}`,
      content: Bun.file(abs) as unknown as Blob,
    }));
    const bytes = [...walk(dir)].reduce((n, f) => n + statSync(f).size, 0);
    console.log(
      `uploading ${local} -> ${remote} (${files.length} files, ${(bytes / 1e9).toFixed(2)} GB)`,
    );
    for await (const ev of uploadFilesWithProgress({
      repo: REPO,
      accessToken,
      files,
      commitTitle: `sync ${remote}`,
    })) {
      if (ev.event === "fileProgress" && ev.state === "uploading") {
        const pct = Math.round(ev.progress * 100);
        if (pct % 25 === 0)
          process.stdout.write(`\r  ${ev.path} ${pct}%        `);
      }
    }
    process.stdout.write("\n");
    console.log(`done: ${remote}`);
  }
  console.log("upload complete");
}

async function fetchAll() {
  const accessToken = token();
  const remoteToLocal = new Map(MOUNTS.map((m) => [m.remote, m.local]));
  const all: Array<{ path: string; size: number }> = [];
  for await (const f of listFiles({ repo: REPO, accessToken, recursive: true })) {
    if (f.type === "file") all.push({ path: f.path, size: f.size });
  }
  for (const f of all) {
    const mount = [...remoteToLocal.keys()]
      .sort((a, b) => b.length - a.length)
      .find((r) => f.path.startsWith(`${r}/`));
    if (!mount) continue;
    const rel = f.path.slice(mount.length + 1);
    const dest = join(ROOT, remoteToLocal.get(mount)!, rel);
    if (existsSync(dest) && statSync(dest).size === f.size) {
      console.log(`ok ${dest} (cached)`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    console.log(`fetching ${f.path} (${(f.size / 1e6).toFixed(1)} MB)`);
    const res = await downloadFile({ repo: REPO, accessToken, path: f.path });
    if (!res) throw new Error(`download failed: ${f.path}`);
    await Bun.write(dest, res); // streams multi-GB shards to disk
  }
  console.log("fetch complete");
}

const mode = process.argv[2];
if (mode === "upload") await upload();
else if (mode === "fetch") await fetchAll();
else {
  console.error("usage: hf-sync.ts <upload|fetch>");
  process.exit(1);
}
