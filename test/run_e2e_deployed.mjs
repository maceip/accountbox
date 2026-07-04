// True end-to-end proof against the DEPLOYED site (default: train.public.computer).
//
// Drives the real product the way a first-run visitor would — no local server,
// no mocks, no seeded state. The shell is journey-gated now, so the E2E EARNS it:
//   1. static pre-checks: app 200, both model mounts 200 + Range=206, adapter 200
//   2. real Chrome + WebGPU opens the site, creates a vault through the UI
//   3. JOURNEY step 1: the chat model (Qwen2.5-3B-Instruct) streams over the
//      wire; one real exchange with the local model completes the step
//   4. JOURNEY step 2: pick the Gmail skill; VibeThinker-3B + LoRA swap onto
//      the GPU (engine-slot displacement must be honest on the chat side);
//      real prompts produce weight-driven plans (true-cold anywhere = FAIL)
//   5. JOURNEY step 3: the connect gate renders — STOP (no real Google login
//      in CI). The shell must still be locked.
//
// Usage:  node test/run_e2e_deployed.mjs           # against production
//         E2E_URL=http://localhost:3000 node test/run_e2e_deployed.mjs
//         E2E_RESOLVE=1.2.3.4 node test/run_e2e_deployed.mjs   # pin the target
//         host to an IP (bypasses stale DNS caches / anycast weirdness) for
//         both the pre-check fetches and Chrome itself.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  launchWebGpuBrowser,
  chromeExecutable,
} from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.E2E_URL || "https://train.public.computer").replace(
  /\/$/,
  "",
);
const HOST = new URL(BASE).hostname;
const RESOLVE = process.env.E2E_RESOLVE || ""; // optional IP pin for Chrome
if (RESOLVE)
  console.log(`Chrome will resolve ${HOST} -> ${RESOLVE} (E2E_RESOLVE)`);
const MASTER_PASSWORD = "e2e-proof-master-password-1";
// Prompts the current adapter parses reliably (from gate-artifact.json); the
// realness assertion covers every prompt, the plan assertion needs >=1 hit.
const SKILL_PROMPTS = [
  "Find the email thread about the vendor contract renewal and extract any open questions or deadlines.",
  "Read the full body of the security audit email and tell me the deadline for responses.",
  "Draft a follow-up to the PR review thread asking for an update on the remaining comments.",
];
const STREAM_BUDGET_MS = 25 * 60_000; // per model, over the wire

const steps = [];
function step(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
  return ok;
}

async function preChecks() {
  const app = await fetch(`${BASE}/`);
  step("app reachable over https", app.ok, `status=${app.status}`);

  const cfg = await fetch(`${BASE}/model/config.json`);
  step("skill model config served", cfg.ok, `status=${cfg.status}`);

  const shard = await fetch(`${BASE}/model/model-00001-of-00002.safetensors`, {
    headers: { Range: "bytes=0-1023" },
  });
  step(
    "skill model shard supports Range",
    shard.status === 206,
    `status=${shard.status}`,
  );

  const chatCfg = await fetch(`${BASE}/model-chat/config.json`);
  step("chat model config served", chatCfg.ok, `status=${chatCfg.status}`);

  const chatShard = await fetch(
    `${BASE}/model-chat/model-00001-of-00002.safetensors`,
    {
      headers: { Range: "bytes=0-1023" },
    },
  );
  step(
    "chat model shard supports Range",
    chatShard.status === 206,
    `status=${chatShard.status}`,
  );

  const adapter = await fetch(
    `${BASE}/adapters/gmail-agent/adapter_config.json`,
  );
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

  let chatReady = false;
  let chatDisplaced = false;
  let skillEquipped = false;
  let sawRealPath = 0;
  let sawTrueCold = 0;
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[chat-runtime] state -> ready")) chatReady = true;
    if (
      t.includes("[chat-runtime] state -> unloaded") &&
      t.includes("another model took the GPU")
    )
      chatDisplaced = true;
    if (t.includes("state -> equipped")) skillEquipped = true;
    if (t.includes("generate REAL path")) sawRealPath++;
    if (t.includes("no equipped weights")) sawTrueCold++;
    if (
      t.startsWith("[emberglass") ||
      t.startsWith("[chat-runtime]") ||
      t.startsWith("[agent:")
    ) {
      console.log("  b>", t.slice(0, 150));
    }
  });
  page.on("pageerror", (e) =>
    console.log("  PAGEERR", String(e).slice(0, 200)),
  );

  const waitUntil = async (cond, deadline) => {
    while (!cond() && Date.now() < deadline) await page.waitForTimeout(2000);
    return cond();
  };

  try {
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // ---- vault setup through the real UI (fresh browser => SetupForm) ----
    const pw = page.getByPlaceholder("Master password");
    await pw.waitFor({ timeout: 30_000 });
    step("vault setup form shown", true);
    await pw.fill(MASTER_PASSWORD);
    await page.getByPlaceholder("Confirm").fill(MASTER_PASSWORD);
    await page.getByRole("button", { name: "Setup Secure Workspace" }).click();

    // ---- the journey gate replaces the shell ----
    await page
      .locator('[data-journey-screen="overview"]')
      .waitFor({ timeout: 60_000 });
    const noSidebar =
      (await page.locator('[data-slot="sidebar"]').count()) === 0;
    step("journey gate shown; shell locked (no sidebar)", noSidebar);

    // ---- STEP 1: chat agent — stream Qwen2.5-3B-Instruct + one real exchange ----
    await page.getByRole("button", { name: "Start" }).click();
    await page
      .locator('[data-journey-screen="chat-agent"]')
      .waitFor({ timeout: 15_000 });
    console.log(
      "  streaming CHAT model over the wire (first load can take many minutes)…",
    );
    if (!(await waitUntil(() => chatReady, Date.now() + STREAM_BUDGET_MS)))
      throw new Error("chat model never reached ready state (25min)");
    step("chat model (Qwen2.5-3B-Instruct) ready in-browser", true);

    const chatBox = page.getByPlaceholder("Say hello to your local model…");
    await chatBox.waitFor({ timeout: 15_000 });
    await chatBox.fill("Say hello in one short sentence.");
    await chatBox.press("Enter");
    await page
      .locator("[data-journey-advance]")
      .waitFor({ timeout: 5 * 60_000 });
    const chatReply = await page
      .locator("div.whitespace-pre-wrap")
      .last()
      .textContent();
    step(
      "real chat exchange completed step 1",
      true,
      `reply: ${chatReply.trim().slice(0, 100).replace(/\n/g, " ")}`,
    );
    await page.locator("[data-journey-advance]").click();

    // ---- STEP 2: first skill — manifest picker, engine swap, real plans ----
    const s2 = await page
      .locator('[data-journey-step="first-skill"]')
      .getAttribute("data-step-state");
    step("overview shows step 2 active", s2 === "active", `state=${s2}`);
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator("[data-skill-picker]").waitFor({ timeout: 15_000 });
    await page.locator('[data-skill-option="gmail-agent"]').click();
    console.log("  streaming SKILL model (engine swap) over the wire…");
    if (!(await waitUntil(() => skillEquipped, Date.now() + STREAM_BUDGET_MS)))
      throw new Error("skill model never reached equipped state (25min)");
    step("VibeThinker-3B + Gmail LoRA equipped (engine swap)", true);
    step("chat model displaced honestly (unloaded status)", chatDisplaced);

    const promptBox = page.locator('[data-skill-equip="gmail-agent"] textarea');
    let plansRendered = 0;
    for (const prompt of SKILL_PROMPTS) {
      await promptBox.fill(prompt);
      await page.getByRole("button", { name: "Plan it" }).click();
      // Wait for this attempt to settle: plan rows or an honest fail note.
      const before = sawRealPath;
      await waitUntil(() => sawRealPath > before, Date.now() + 5 * 60_000);
      await page.waitForTimeout(1500);
      // A rendered plan completes the step; retries after non-plan outputs are fine.
      if ((await page.locator("[data-skill-plan]").count()) > 0) {
        plansRendered++;
        console.log(`  plan rendered for: ${prompt.slice(0, 60)}…`);
        break;
      }
      console.log(
        `  no plan (honest non-plan output) for: ${prompt.slice(0, 60)}…`,
      );
    }
    step(
      "real inference ran for skill prompts",
      sawRealPath >= 1,
      `REAL-path calls=${sawRealPath}`,
    );
    step(
      "no true-cold (unequipped) generation",
      sawTrueCold === 0,
      `trueCold=${sawTrueCold}`,
    );
    step(
      "weight-driven plan rendered (planned-not-executed)",
      plansRendered >= 1,
    );

    // ---- trace contract: the real plan above must land in OPFS with full
    // provenance (v1 schema, skillId, prompt hash, stamped adapter version) ----
    const trace = await page.evaluate(async () => {
      const list = window.listAgentTraces ? await window.listAgentTraces() : [];
      return list.length ? list[list.length - 1] : null;
    });
    const traceOk =
      !!trace &&
      trace.v === 1 &&
      trace.skillId === "gmail-agent" &&
      typeof trace.promptSha256 === "string" &&
      trace.promptSha256.length === 64 &&
      typeof trace.adapter?.version === "string" &&
      trace.context === "test" &&
      !!trace.plan;
    step(
      "provenance-stamped trace recorded in OPFS",
      traceOk,
      trace
        ? `adapter=${trace.adapter?.version} sha=${String(trace.promptSha256).slice(0, 12)}… context=${trace.context}`
        : "no trace found in OPFS",
    );

    await page.locator("[data-journey-advance]").waitFor({ timeout: 30_000 });
    await page.locator("[data-journey-advance]").click();

    // ---- STEP 3: connect gate — render and STOP (no real Google login in CI) ----
    const s3 = await page
      .locator('[data-journey-step="connect-account"]')
      .getAttribute("data-step-state");
    step("overview shows step 3 active", s3 === "active", `state=${s3}`);
    await page.getByRole("button", { name: "Start" }).click();
    await page
      .locator('[data-journey-screen="connect-account"]')
      .waitFor({ timeout: 15_000 });
    await page
      .locator('[data-connect-state="waiting"]')
      .waitFor({ timeout: 15_000 });
    step("connect gate renders (journey stops here in CI)", true);
    const stillNoSidebar =
      (await page.locator('[data-slot="sidebar"]').count()) === 0;
    step("shell still locked before account connects", stillNoSidebar);
  } catch (e) {
    step("e2e flow", false, String(e).slice(0, 300));
  } finally {
    await browser.close();
  }

  const pass = steps.every((s) => s.ok);
  const artifact = {
    schema: "accountbox/e2e-deployed/v2-journey",
    capturedAt: new Date().toISOString(),
    target: BASE,
    chrome: chromeExecutable() || "playwright chromium",
    steps,
    pass,
  };
  await writeFile(
    join(ROOT, "e2e-artifact.json"),
    JSON.stringify(artifact, null, 2),
  );
  console.log(`\nE2E ${pass ? "PASS" : "FAIL"} — artifact: e2e-artifact.json`);
  process.exitCode = pass ? 0 : 1;
}

main();
