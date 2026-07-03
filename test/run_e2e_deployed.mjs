// True end-to-end proof against the DEPLOYED site (default: train.public.computer).
//
// Drives the real product the way a visitor would — no local server, no mocks:
//   1. static pre-checks: app 200, model config 200, 5GB shard Range=206, adapter 200
//   2. real Chrome + WebGPU opens the site
//   3. creates a vault through the actual UI (master password form)
//   4. the local-agent chat auto-loads VibeThinker-3B + Gmail LoRA over the wire
//   5. sends real prompts through the chat; asserts REAL weight-driven plans
//      (console must show the runtime's REAL path; true-cold anywhere = FAIL)
//
// Usage:  node test/run_e2e_deployed.mjs           # against production
//         E2E_URL=http://localhost:3000 node test/run_e2e_deployed.mjs
//         E2E_RESOLVE=1.2.3.4 node test/run_e2e_deployed.mjs   # pin the target
//         host to an IP (bypasses stale DNS caches / anycast weirdness) for
//         both the pre-check fetches and Chrome itself.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser, chromeExecutable } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.E2E_URL || "https://train.public.computer").replace(/\/$/, "");
const HOST = new URL(BASE).hostname;
const RESOLVE = process.env.E2E_RESOLVE || ""; // optional IP pin for Chrome
if (RESOLVE) console.log(`Chrome will resolve ${HOST} -> ${RESOLVE} (E2E_RESOLVE)`);
const MASTER_PASSWORD = "e2e-proof-master-password-1";
// Prompts the current adapter parses reliably (from gate-artifact.json); the
// realness assertion covers every prompt, the plan assertion needs >=1 hit.
const PROMPTS = [
  "Find the email thread about the vendor contract renewal and extract any open questions or deadlines.",
  "Read the full body of the security audit email and tell me the deadline for responses.",
  "Draft a follow-up to the PR review thread asking for an update on the remaining comments.",
  "Find the thread with the travel expenses and create a draft reply confirming the receipts are attached.",
];

const steps = [];
function step(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function preChecks() {
  const app = await fetch(`${BASE}/`);
  step("app reachable over https", app.ok, `status=${app.status}`);

  const cfg = await fetch(`${BASE}/model/config.json`);
  step("model config served", cfg.ok, `status=${cfg.status}`);

  const shard = await fetch(`${BASE}/model/model-00001-of-00002.safetensors`, {
    headers: { Range: "bytes=0-1023" },
  });
  step("5GB shard supports Range", shard.status === 206, `status=${shard.status}`);

  const adapter = await fetch(`${BASE}/adapters/gmail-agent/adapter_config.json`);
  step("LoRA adapter served", adapter.ok, `status=${adapter.status}`);
}

async function main() {
  console.log(`E2E against ${BASE}`);
  await preChecks();

  const browser = await launchWebGpuBrowser({
    headless: false,
    extraArgs: RESOLVE ? [`--host-resolver-rules=MAP ${HOST} ${RESOLVE}`] : [],
  });
  const context = await browser.newContext(); // fresh profile: no vault, no cache
  const page = await context.newPage();

  let sawRealPath = 0;
  let sawTrueCold = 0;
  let equippedSeen = false;
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("generate REAL path")) sawRealPath++;
    if (t.includes("no equipped weights")) sawTrueCold++;
    if (t.includes("state -> equipped")) equippedSeen = true;
    if (t.startsWith("[emberglass]") || t.startsWith("[gmail-agent-runtime]")) {
      console.log("  b>", t.slice(0, 150));
    }
  });
  page.on("pageerror", (e) => console.log("  PAGEERR", String(e).slice(0, 200)));

  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // ---- vault setup through the real UI (fresh browser => SetupForm) ----
    const pw = page.getByPlaceholder("Master password");
    await pw.waitFor({ timeout: 30_000 });
    step("vault setup form shown", true);
    await pw.fill(MASTER_PASSWORD);
    await page.getByPlaceholder("Confirm").fill(MASTER_PASSWORD);
    await page.getByRole("button", { name: "Setup Secure Workspace" }).click();

    // ---- app shell + local agent chat (agent tile is open by default) ----
    const chatInput = page.getByPlaceholder("e.g. Find all unread from manager this week...");
    await chatInput.waitFor({ timeout: 60_000 });
    step("vault created; app shell + agent tile mounted", true);

    // ---- real model + adapter load over the network (the slow, honest part) ----
    // NOTE: don't match page text "REAL (tuned)" — the chat's empty-state copy
    // quotes that exact string, so a text match fires before the model loads.
    // The runtime's console line `state -> equipped` is the ground truth.
    console.log("  streaming model weights over the wire (first load can take minutes)…");
    const equipDeadline = Date.now() + 25 * 60_000;
    while (!equippedSeen && Date.now() < equipDeadline) {
      await page.waitForTimeout(2000);
    }
    if (!equippedSeen) throw new Error("engine never reached equipped state (25min)");
    // UI must agree: the agent status dot reports equipped.
    await page
      .locator('[data-agent-state="equipped"]')
      .first()
      .waitFor({ timeout: 30_000 });
    step("VibeThinker-3B + Gmail LoRA equipped in-browser (WebGPU)", true);

    // ---- drive the chat with real prompts ----
    const input = chatInput;
    let realPlans = 0;
    for (const prompt of PROMPTS) {
      const before = await page.locator("div.whitespace-pre-wrap").count();
      await input.fill(prompt);
      await input.press("Enter");
      // wait for the assistant message (appears immediately, fills when done)
      await page.waitForFunction(
        ([n]) => {
          const msgs = document.querySelectorAll("div.whitespace-pre-wrap");
          const last = msgs[msgs.length - 1];
          return msgs.length >= n + 2 && last && last.textContent.trim().length > 0;
        },
        [before],
        { timeout: 5 * 60_000 },
      );
      const text = await page.locator("div.whitespace-pre-wrap").last().textContent();
      const isRealPlan = /"plan"|REAL ENGINE — Plan:/.test(text) && !/^COLD/.test(text.trim());
      if (isRealPlan) realPlans++;
      console.log(`  prompt: ${prompt.slice(0, 60)}…`);
      console.log(`  reply : ${text.trim().slice(0, 160).replace(/\n/g, " ")}`);
    }

    step("real inference ran for every prompt", sawRealPath >= PROMPTS.length, `REAL-path calls=${sawRealPath}`);
    step("no true-cold (unequipped) generation", sawTrueCold === 0, `trueCold=${sawTrueCold}`);
    step("at least one valid weight-driven plan", realPlans >= 1, `validPlans=${realPlans}/${PROMPTS.length}`);
  } catch (e) {
    step("e2e flow", false, String(e).slice(0, 300));
  } finally {
    await browser.close();
  }

  const pass = steps.every((s) => s.ok);
  const artifact = {
    schema: "accountbox/e2e-deployed/v1",
    capturedAt: new Date().toISOString(),
    target: BASE,
    chrome: chromeExecutable() || "playwright chromium",
    steps,
    pass,
  };
  await writeFile(join(ROOT, "e2e-artifact.json"), JSON.stringify(artifact, null, 2));
  console.log(`\nE2E ${pass ? "PASS" : "FAIL"} — artifact: e2e-artifact.json`);
  process.exitCode = pass ? 0 : 1;
}

main();
