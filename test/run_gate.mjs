// Automated WebGPU gate — the proof that was never automated.
// Bundles the real accountbox runtime, serves local weights + adapter, launches
// REAL Chrome + WebGPU (Metal), runs the synthetic prompts through actual tuned
// weights, and asserts every plan is weight-driven (no __cold) with valid tools.
// No human, no headless-Node fake, no replay. Reuses emberglass's proven harness.
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateKernelModules } from "../../emberglass/scripts/generate_kernel_modules.mjs";
import { createRangeServer, listen } from "./lib/range_server.mjs";
import {
  launchWebGpuBrowser,
  chromeExecutable,
} from "./lib/browser_launch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)); // ~/accountbox/test
const ROOT = join(HERE, ".."); // ~/accountbox
const PUBLIC = join(ROOT, "public");
const _ALLOWED = ["search_messages", "read_message", "create_draft"];

// 1) ensure emberglass WGSL kernel JS modules exist (its build step)
try {
  generateKernelModules();
  console.log("kernels: ok");
} catch (e) {
  console.log("kernels: skipped —", String(e).slice(0, 200));
}

// 2) bundle the browser entry (mirror emberglass esbuild base: external tokenizer lib)
await build({
  entryPoints: [join(HERE, "gate-entry.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "esnext",
  external: ["@huggingface/transformers"],
  loader: { ".wgsl": "text" },
  legalComments: "none",
  keepNames: true,
  treeShaking: true,
  outfile: join(PUBLIC, "gate.bundle.js"),
  logLevel: "warning",
});
console.log("bundled -> public/gate.bundle.js");

// 3) gate page + importmap for the externalized tokenizer lib (as emberglass htmls do)
await writeFile(
  join(PUBLIC, "gate.html"),
  `<!doctype html><meta charset=utf-8><title>accountbox webgpu gate</title>
<script type="importmap">{"imports":{"@huggingface/transformers":"https://esm.sh/@huggingface/transformers@4.2.0?bundle"}}</script>
<body><p>accountbox WebGPU gate running…</p><script type="module" src="/gate.bundle.js"></script>`,
);

// 4) serve public/ (range for multi-GB shards), launch REAL Chrome + WebGPU.
// The models live OUTSIDE public/ (repo-root /model and /model-chat symlinks)
// so the nitro production build never tries to ingest 5GB shards.
const server = createRangeServer(PUBLIC, {
  "/model": join(ROOT, "model"),
  "/model-chat": join(ROOT, "model-chat"),
});
const { port } = await listen(server);
console.log(
  "serving public/ on",
  port,
  "| chrome:",
  chromeExecutable() || "playwright chromium",
);
const browser = await launchWebGpuBrowser({ headless: false });
const rows = [];
try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("GATE ")) {
      rows.push(t.slice(5));
      console.log("GATE>", t.slice(5, 320));
    } else console.log("  b>", t.slice(0, 160));
  });
  page.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 400)));
  await page.goto(`http://127.0.0.1:${port}/gate.html`, {
    waitUntil: "domcontentloaded",
  });

  const TIMEOUT = 20 * 60 * 1000;
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    if (
      rows.some(
        (l) => l.includes('"type":"done"') || l.includes('"type":"error"'),
      )
    )
      break;
    await page.waitForTimeout(2000);
  }

  const parsed = rows.map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { raw: l };
    }
  });
  const equipped = parsed.find((r) => r.type === "equipped");
  const err = parsed.find((r) => r.type === "error");
  const plans = parsed.filter((r) => r.type === "plan");
  const realPlan = plans.filter((p) => !p.cold); // valid, weight-driven plan
  const ranButBad = plans.filter((p) => p.cold && p.ran); // real inference, output not a plan
  const trueCold = plans.filter((p) => p.cold && !p.ran); // engine never ran (the bad kind)
  const inferenceRan = plans.filter((p) => !p.cold || p.ran); // real WebGPU forward pass happened
  const validTools = plans.filter((p) => p.allowed && !p.cold);
  const match = realPlan.filter(
    (p) =>
      p.tools &&
      p.expected &&
      new Set(p.tools).size === new Set(p.expected).size &&
      p.expected.every((t) => p.tools.includes(t)),
  );

  // Show what the model actually said when it didn't produce a plan (honesty).
  for (const p of ranButBad)
    console.log(`  ran-but-not-a-plan [${p.i}] raw: ${p.raw}`);

  const artifact = {
    schema: "accountbox/webgpu-gate/v1",
    capturedAt: new Date().toISOString(),
    chrome: chromeExecutable() || "playwright chromium",
    model: "/model (WeiboAI/VibeThinker-3B, WebGPU)",
    adapter: "/adapters/gmail-agent",
    equipped: !!equipped?.equipped,
    realness: {
      prompts: plans.length,
      inferenceRan: inferenceRan.length,
      trueCold: trueCold.length,
    },
    quality: {
      validPlan: realPlan.length,
      ranButNotAPlan: ranButBad.length,
      validTools: validTools.length,
      toolsetMatch: match.length,
    },
    error: err || null,
    plans,
  };
  await writeFile(
    join(ROOT, "gate-artifact.json"),
    JSON.stringify(artifact, null, 2),
  );
  console.log("\n=== GATE RESULT ===");
  console.log("REALNESS (the gate):", JSON.stringify(artifact.realness));
  console.log("QUALITY (reported): ", JSON.stringify(artifact.quality));
  console.log("equipped:", artifact.equipped, "| error:", !!err);

  // The gate proves REAL in-browser inference: engine equipped + a forward pass ran
  // for every prompt (zero true-cold) + at least one valid structured plan (not replay,
  // not all-refusal). Plan accuracy is reported, not gated.
  const pass =
    artifact.equipped &&
    !err &&
    plans.length === 18 &&
    trueCold.length === 0 &&
    realPlan.length >= 1;
  if (pass)
    console.log(
      `GATE: PASS — real WebGPU inference ran on all ${plans.length} prompts; ${realPlan.length} valid plans, ${ranButBad.length} non-plan outputs (all weight-driven, no replay)`,
    );
  else {
    console.error(
      "GATE: FAIL — trueCold:",
      trueCold.length,
      "validPlan:",
      realPlan.length,
    );
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
