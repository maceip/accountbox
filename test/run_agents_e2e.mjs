// End-to-end proof for the ax multi-agent Agents Lab, in a REAL WebGPU browser.
//
// Everything here runs the actual product path on this machine's GPU — no
// mocks, no replay. It proves the four original requirements:
//   1. ax drives the agents (concierge program + typed fn() tools)
//   2. multi-agent: concierge chat + skill/trainer handoffs
//   3. in-browser / WASM+WebGPU: the house Emberglass kernels, client-side
//   4. train/eval the base VibeThinker-3B on real bbtriage data, in-browser
//
// Flow (against a locally running dev server by default):
//   0. static pre-checks: app 200, /model + /model-chat Range=206,
//      bbtriage adapter + dataset served
//   1. real Chrome + WebGPU opens /agents, vault set up through the UI
//   2. CONCIERGE: load chat model, send a message, get a real reply
//   3. HANDOFF: bbtriage panel runs VibeThinker-3B + bbtriage LoRA -> a JSON
//      verdict from real inference (chat model displaced honestly)
//   4. TRAINER: load base + dataset, eval base, 20 real AdamW LoRA steps
//      (loss must fall), eval trained (held-out delta must improve), export
//      the adapter to OPFS, and re-equip it from OPFS
//
// Usage:  E2E_URL=http://localhost:3000 node test/run_agents_e2e.mjs
//         node test/run_agents_e2e.mjs                # defaults to localhost:3000
//         HEADLESS=1 node test/run_agents_e2e.mjs
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const BASE = (process.env.E2E_URL || "http://localhost:3000").replace(/\/$/, "");
const MASTER_PASSWORD = "agents-e2e-master-password-1";
const STREAM_BUDGET_MS = 25 * 60_000; // per model load, over the wire
const TRAIN_BUDGET_MS = 15 * 60_000;

const steps = [];
function step(name, ok, detail = "") {
  steps.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function preChecks() {
  const app = await fetch(`${BASE}/`);
  step("app reachable", app.ok, `status=${app.status}`);
  for (const mount of ["model", "model-chat"]) {
    const cfg = await fetch(`${BASE}/${mount}/config.json`);
    step(`${mount} config served`, cfg.ok, `status=${cfg.status}`);
    const shard = await fetch(
      `${BASE}/${mount}/model-00001-of-00002.safetensors`,
      { headers: { Range: "bytes=0-1023" } },
    );
    step(`${mount} shard supports Range`, shard.status === 206, `status=${shard.status}`);
  }
  const adapter = await fetch(`${BASE}/adapters/bbtriage/adapter_config.json`);
  step("bbtriage adapter served", adapter.ok, `status=${adapter.status}`);
  for (const split of ["train", "valid"]) {
    const ds = await fetch(`${BASE}/datasets/bbtriage/${split}.jsonl`);
    step(`bbtriage ${split} dataset served`, ds.ok, `status=${ds.status}`);
  }
}

const SAMPLE_REPORT =
  "Title: Missing rate limiting on /login\n\n" +
  "The login endpoint does not enforce any rate limiting. I sent 500 requests " +
  "in 10 seconds with different passwords and none were blocked. No account " +
  "lockout, no CAPTCHA. This allows brute forcing credentials.\n\n" +
  "Steps: 1) intercept POST /login 2) send to intruder 3) observe all 200/302.";

async function main() {
  console.log(`Agents Lab E2E against ${BASE}`);
  await preChecks();

  const browser = await launchWebGpuBrowser({ headless: process.env.HEADLESS === "1" });
  const context = await browser.newContext();
  const page = await context.newPage();

  let chatDisplaced = false;
  page.on("console", (m) => {
    const t = m.text();
    if (
      t.includes("[chat-runtime] state -> unloaded") &&
      t.includes("another model took the GPU")
    )
      chatDisplaced = true;
    if (
      t.startsWith("[emberglass") ||
      t.startsWith("[chat-runtime]") ||
      t.startsWith("[train-runtime]") ||
      t.startsWith("[agent:")
    )
      console.log("  b>", t.slice(0, 150));
  });
  page.on("pageerror", (e) => console.log("  PAGEERR", String(e).slice(0, 200)));

  // cond is async; tolerate transient locator errors while the UI re-renders.
  const check = async (cond) => {
    try {
      return !!(await cond());
    } catch {
      return false;
    }
  };
  const waitUntil = async (cond, deadline) => {
    while (Date.now() < deadline) {
      if (await check(cond)) return true;
      await page.waitForTimeout(1500);
    }
    return check(cond);
  };
  const testid = (id) => page.locator(`[data-testid="${id}"]`);
  // Cheap read for polling: empty string when the element isn't there yet.
  const textOf = async (id) => {
    const loc = testid(id);
    if ((await loc.count()) === 0) return "";
    return (await loc.textContent({ timeout: 2_000 })) || "";
  };

  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // ---- vault setup through the real UI (fresh browser => SetupForm) ----
    const pw = page.getByPlaceholder("Master password");
    await pw.waitFor({ timeout: 30_000 });
    await pw.fill(MASTER_PASSWORD);
    await page.getByPlaceholder("Confirm").fill(MASTER_PASSWORD);
    await page.getByRole("button", { name: "Setup Secure Workspace" }).click();

    // Grandfather the journey so the workbench shell (with /agents) mounts.
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      localStorage.setItem(
        "accountbox:journey",
        JSON.stringify({
          v: 1,
          done: ["chat-agent", "first-skill", "connect-account"],
          completedVia: "grandfathered",
        }),
      );
    });

    // The vault key is in-memory only, so navigating (a reload) re-locks it.
    // Go to /agents, then unlock through the UI exactly like a returning user.
    await page.goto(`${BASE}/agents`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const unlockPw = page.getByPlaceholder("Master password");
    const unlockShown = await unlockPw
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (unlockShown) {
      await unlockPw.fill(MASTER_PASSWORD);
      await page.getByRole("button", { name: "Unlock" }).click();
    }
    await testid("chat-input").waitFor({ timeout: 45_000 });
    step("Agents Lab route rendered", true);

    // ---- CONCIERGE: load chat model + one real exchange ----
    const loadBtn = testid("chat-load-model");
    if (await loadBtn.isVisible().catch(() => false)) await loadBtn.click();
    console.log("  streaming CHAT model (first load can take minutes)…");
    await waitUntil(
      async () => /Qwen|ready/i.test(await textOf("chat-model-state")),
      Date.now() + STREAM_BUDGET_MS,
    );
    const chatState = (await textOf("chat-model-state")).trim();
    step("chat model ready in-browser", /Qwen|ready/i.test(chatState), chatState);

    await testid("chat-input").fill("Say hello in one short sentence.");
    await testid("chat-send").click();
    await waitUntil(
      async () => (await testid("chat-reply").count()) > 0,
      Date.now() + 5 * 60_000,
    );
    const reply = ((await testid("chat-reply").last().textContent()) || "").trim();
    step("concierge produced a real reply", reply.length > 0, reply.slice(0, 100));

    // ---- HANDOFF: bbtriage inference on VibeThinker-3B + bbtriage LoRA ----
    await testid("triage-input").fill(SAMPLE_REPORT);
    await testid("triage-run").click();
    console.log("  running bbtriage handoff (engine swap to skill model)…");
    await waitUntil(
      async () => (await textOf("triage-result")).length > 0,
      Date.now() + STREAM_BUDGET_MS,
    );
    const triage = (await textOf("triage-result")).trim();
    let verdictOk = false;
    try {
      verdictOk = typeof JSON.parse(triage).disposition === "string";
    } catch {}
    step("bbtriage returned a real JSON verdict", verdictOk, triage.slice(0, 120));
    step("chat model displaced honestly on handoff", chatDisplaced);

    // ---- TRAINER: real in-browser train/eval loop ----
    await testid("trainer-load-base").click();
    console.log("  streaming TRAINER base model…");
    await waitUntil(
      async () => (await textOf("trainer-state")).trim() === "ready",
      Date.now() + STREAM_BUDGET_MS,
    );
    await testid("trainer-load-dataset").click();
    const dsOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("dataset:"),
      Date.now() + 60_000,
    );
    step("dataset loaded", dsOk, (await textOf("trainer-last-action")).trim());

    await testid("trainer-eval-base").click();
    await waitUntil(
      async () => (await testid("eval-results").count()) > 0,
      Date.now() + TRAIN_BUDGET_MS,
    );
    const baseEvalText = await textOf("eval-results");
    const baseLoss = Number(/heldout base: ([\d.]+)/.exec(baseEvalText)?.[1]);
    step("base held-out eval ran", Number.isFinite(baseLoss), `base=${baseLoss}`);

    await testid("trainer-train").click();
    console.log("  running 20 real AdamW LoRA steps…");
    await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("trained 20"),
      Date.now() + TRAIN_BUDGET_MS,
    );
    const trainMsg = (await textOf("trainer-last-action")).trim();
    const m = /trained 20 steps: ([\d.]+) → ([\d.]+)/.exec(trainMsg);
    const firstLoss = Number(m?.[1]);
    const lastLoss = Number(m?.[2]);
    step("20 real training steps ran", Number.isFinite(firstLoss) && Number.isFinite(lastLoss), trainMsg);
    step("training loss decreased", lastLoss < firstLoss, `${firstLoss} → ${lastLoss}`);

    await testid("trainer-eval-trained").click();
    await waitUntil(
      async () => (await textOf("eval-results")).includes("heldout trained:"),
      Date.now() + TRAIN_BUDGET_MS,
    );
    const delta = Number((await textOf("eval-delta")) || "NaN");
    step("held-out eval delta computed (base − trained)", Number.isFinite(delta), `delta=${delta}`);
    step("trained adapter improved held-out loss", delta > 0, `delta=${delta}`);

    await testid("trainer-export").click();
    const exportOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("exported"),
      Date.now() + 60_000,
    );
    step("adapter exported to OPFS", exportOk, (await textOf("trainer-last-action")).trim());

    await testid("trainer-equip").click();
    const equipOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("re-equipped"),
      Date.now() + 120_000,
    );
    step("adapter re-equipped from OPFS", equipOk, (await textOf("trainer-last-action")).trim());
  } catch (e) {
    step("run completed without fatal error", false, String(e).slice(0, 200));
  } finally {
    await browser.close().catch(() => {});
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((s) => s.name).join("; "));
    process.exit(1);
  }
  console.log("AGENTS E2E: ALL PASS");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
