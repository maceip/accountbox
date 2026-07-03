// Verifies the cross-tab engine guard: tab A starts building the engine (takes
// the Web Lock); tab B must fail fast with "active in another tab" instead of
// loading a second 3B model into the same GPU. Does NOT wait for the full
// weight load — the lock is taken at equip start, so this check is quick.
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRangeServer, listen } from "./lib/range_server.mjs";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PUBLIC = join(ROOT, "public");

await build({
  entryPoints: [join(HERE, "gate-entry.ts")],
  bundle: true, format: "esm", platform: "browser", target: "esnext",
  external: ["@huggingface/transformers"],
  outfile: join(PUBLIC, "gate.bundle.js"),
  logLevel: "silent",
});
await writeFile(join(PUBLIC, "gate.html"),
`<!doctype html><meta charset=utf-8><script type="importmap">{"imports":{"@huggingface/transformers":"https://esm.sh/@huggingface/transformers@4.2.0?bundle"}}</script>
<body><script type="module" src="/gate.bundle.js"></script>`);

const server = createRangeServer(PUBLIC, {
  "/model": join(ROOT, "model"),
  "/model-chat": join(ROOT, "model-chat"),
});
const { port } = await listen(server);
const browser = await launchWebGpuBrowser({ headless: false });

try {
  const context = await browser.newContext();

  const tabA = await context.newPage();
  let aEquipping = false;
  tabA.on("console", (m) => { if (m.text().includes("Equipping adapter")) aEquipping = true; });
  await tabA.goto(`http://127.0.0.1:${port}/gate.html`);
  const t0 = Date.now();
  while (!aEquipping && Date.now() - t0 < 30_000) await tabA.waitForTimeout(300);
  if (!aEquipping) throw new Error("tab A never started equipping");
  console.log("tab A: engine build started (lock held)");

  const tabB = await context.newPage();
  let bBlocked = false;
  let bEquipping = false;
  tabB.on("console", (m) => {
    const t = m.text();
    if (t.includes("active in another tab")) bBlocked = true;
    if (t.includes("tokenizer loaded")) bEquipping = true; // would mean a 2nd engine
  });
  await tabB.goto(`http://127.0.0.1:${port}/gate.html`);
  const t1 = Date.now();
  while (!bBlocked && Date.now() - t1 < 30_000) await tabB.waitForTimeout(300);

  if (bBlocked && !bEquipping) {
    console.log("tab B: correctly blocked — no second engine. PASS");
  } else {
    console.error(`FAIL — blocked=${bBlocked} secondEngineStarted=${bEquipping}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
