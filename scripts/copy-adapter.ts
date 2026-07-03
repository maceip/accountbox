#!/usr/bin/env bun
/**
 * Dev helper: copy a real adapter dir from ~/bbverifier (or arg) into the places
 * the runtime can serve it from for equipAdapter({type:'local-path'|'http'}).
 *
 * Copies:
 *  - public/adapters/<name>/   (for browser http:/adapters/... during dev)
 *  - adapters/<name>/          (for other scripts)
 *
 * Normalizes the weight file to adapters.safetensors if a variant is present.
 */
import { mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_SRC = "/Users/mac/bbverifier/adapters/gmail-agent";
const DEFAULT_NAME = "gmail-agent";

async function main() {
  const src = resolve(process.argv[2] || DEFAULT_SRC);
  const name = process.argv[3] || DEFAULT_NAME;

  const pubDst = resolve("public/adapters", name);
  const rootDst = resolve("adapters", name);

  await mkdir(pubDst, { recursive: true });
  await mkdir(rootDst, { recursive: true });

  const entries = await readdir(src);
  let hasConfig = false;
  let hasSafetensors = false;

  for (const e of entries) {
    const full = join(src, e);
    const st = await stat(full);
    if (!st.isFile()) continue;

    let dstName = e;
    if (e.endsWith(".safetensors") && !e.includes("adapter_config")) {
      dstName = "adapters.safetensors";
      hasSafetensors = true;
    }
    if (e === "adapter_config.json" || dstName === "adapter_config.json") {
      hasConfig = true;
    }

    await copyFile(full, join(pubDst, dstName));
    await copyFile(full, join(rootDst, dstName));
    console.log("copied", e, "->", dstName);
  }

  if (!hasConfig) {
    console.warn("WARNING: no adapter_config.json found in source");
  }
  if (!hasSafetensors) {
    console.warn("WARNING: no .safetensors found (after normalize)");
  }

  console.log(`Adapter "${name}" staged.`);
  console.log("  public:", pubDst);
  console.log("  root  :", rootDst);
  console.log(`Now in-app: equipAdapter({type:'http', url:'/adapters/${name}'})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
