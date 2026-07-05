// End-to-end proof for in-browser GRPO, in a REAL WebGPU browser.
//
// GRPO (group-relative policy optimization) runs entirely on this machine's
// GPU through the vendored engine (src/engine/) — no mocks, no replay. It
// proves the reinforcement path on top of the SFT trainer:
//   1. ax/agents UI drives a real GRPO run on VibeThinker-3B + a trainable LoRA
//   2. rollouts are sampled from the current policy (>= 2 distinct completions)
//   3. the verifiable bbtriage reward rises over the run
//   4. held-out disposition accuracy does not regress
//   5. the GRPO-trained adapter exports to OPFS and re-equips
//
// Reuses the same vault/journey bootstrap as run_agents_e2e.mjs.
//
// Usage:  E2E_URL=http://localhost:3000 node test/run_grpo_e2e.mjs
//         HEADLESS=1 node test/run_grpo_e2e.mjs
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const BASE = (process.env.E2E_URL || "http://localhost:3000").replace(/\/$/, "");
const MASTER_PASSWORD = "grpo-e2e-master-password-1";
const STREAM_BUDGET_MS = 25 * 60_000; // per model load, over the wire
const GRPO_BUDGET_MS = 25 * 60_000; // 8 iterations of sample+score+step

const steps = [];
function step(name, ok, detail = "") {
  steps.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function preChecks() {
  const app = await fetch(`${BASE}/`);
  step("app reachable", app.ok, `status=${app.status}`);
  const cfg = await fetch(`${BASE}/model/config.json`);
  step("model config served", cfg.ok, `status=${cfg.status}`);
  const shard = await fetch(`${BASE}/model/model-00001-of-00002.safetensors`, {
    headers: { Range: "bytes=0-1023" },
  });
  step("model shard supports Range", shard.status === 206, `status=${shard.status}`);
  for (const split of ["train", "valid"]) {
    const ds = await fetch(`${BASE}/datasets/bbtriage/${split}.jsonl`);
    step(`bbtriage ${split} dataset served`, ds.ok, `status=${ds.status}`);
  }
}

async function main() {
  console.log(`GRPO E2E against ${BASE}`);
  await preChecks();

  const browser = await launchWebGpuBrowser({ headless: process.env.HEADLESS === "1" });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture the structured GRPO logs so we can assert distinct rollouts.
  const rolloutTexts = new Set();
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("[grpo] rollout")) rolloutTexts.add(t);
    if (
      t.startsWith("[grpo]") ||
      t.startsWith("[emberglass") ||
      t.startsWith("[train-runtime]") ||
      t.startsWith("[weight-fetch]")
    )
      console.log("  b>", t.slice(0, 150));
  });
  page.on("pageerror", (e) => console.log("  PAGEERR", String(e).slice(0, 200)));
  // Auth calls are the vault gate's server dependency — surface their status.
  page.on("response", (r) => {
    if (r.url().includes("/api/auth/"))
      console.log("  auth>", r.status(), r.url().replace(BASE, "").slice(0, 80));
  });

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
    // create() saves the envelope THEN unlocks — the gate re-renders (setup
    // form disappears) only after both; waiting on that beats a fixed sleep.
    await pw.waitFor({ state: "hidden", timeout: 60_000 });
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

    await page.goto(`${BASE}/agents`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Reload re-locks (vault key is in-memory only): unlock through the real
    // UI. Selectors match UnlockForm: #vault-unlock-password + "Unlock workbench".
    // Loop instead of a one-shot wait — hydration and the auth round-trip can
    // each be slow on a cold dev server, and a rejected unlock renders an
    // error we want surfaced, not swallowed.
    const unlockPw = page.locator("#vault-unlock-password");
    const chatInput = testid("chat-input");
    const gateDeadline = Date.now() + 120_000;
    while (Date.now() < gateDeadline) {
      if (await check(async () => await chatInput.isVisible())) break;
      if (await check(async () => await unlockPw.isVisible())) {
        await unlockPw.fill(MASTER_PASSWORD);
        await page.getByRole("button", { name: "Unlock workbench" }).click();
        await page.waitForTimeout(2_000);
        if (await check(async () => page.getByText("did not unlock").isVisible()))
          console.log("  unlock rejected — retrying");
      }
      await page.waitForTimeout(1_000);
    }
    await chatInput.waitFor({ timeout: 45_000 });
    await testid("trainer-load-base").waitFor({ timeout: 15_000 });
    step("Agents Lab route rendered", true);

    // ---- load the trainable base (VibeThinker-3B) ----
    await testid("trainer-load-base").click();
    console.log("  streaming TRAINER base model…");
    await waitUntil(
      async () => (await textOf("trainer-state")).trim() === "ready",
      Date.now() + STREAM_BUDGET_MS,
    );
    step("trainer base ready in-browser", (await textOf("trainer-state")).trim() === "ready");

    // ---- baseline held-out accuracy (before GRPO) ----
    await testid("trainer-accuracy").click();
    const baseAccOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("heldout accuracy:"),
      Date.now() + GRPO_BUDGET_MS,
    );
    const baseAcc = Number(
      /heldout accuracy: ([\d.]+)%/.exec(await textOf("trainer-last-action"))?.[1],
    );
    step("baseline held-out accuracy measured", baseAccOk && Number.isFinite(baseAcc), `acc=${baseAcc}%`);

    // ---- run GRPO (loads dataset, samples groups, scores, policy-gradient) ----
    await testid("trainer-grpo").click();
    console.log("  running 8 GRPO iterations (sample + reward + weighted step)…");
    const grpoOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("GRPO 8 iters"),
      Date.now() + GRPO_BUDGET_MS,
    );
    const grpoMsg = (await textOf("trainer-last-action")).trim();
    step("GRPO run completed", grpoOk, grpoMsg);

    // reward curve must exist and rise (last iteration vs first)
    const rewardCurveOk = await waitUntil(
      async () => (await testid("reward-curve").count()) > 0,
      Date.now() + 30_000,
    );
    const m = /mean reward ([\d.]+) → ([\d.]+)/.exec(grpoMsg);
    const firstReward = Number(m?.[1]);
    const lastReward = Number(m?.[2]);
    step("reward curve rendered", rewardCurveOk);
    step(
      "GRPO mean reward increased",
      Number.isFinite(firstReward) && Number.isFinite(lastReward) && lastReward > firstReward,
      `${firstReward} → ${lastReward}`,
    );
    step(
      "policy produced distinct rollouts (on-policy sampling)",
      rolloutTexts.size >= 2,
      `${rolloutTexts.size} distinct rollout logs`,
    );

    // ---- held-out accuracy after GRPO must not regress ----
    await testid("trainer-accuracy").click();
    await waitUntil(
      async () => {
        const t = await textOf("trainer-last-action");
        return t.includes("heldout accuracy:") && !t.includes(`${baseAcc}%`);
      },
      Date.now() + GRPO_BUDGET_MS,
    );
    const postAcc = Number(
      /heldout accuracy: ([\d.]+)%/.exec(await textOf("trainer-last-action"))?.[1],
    );
    step(
      "held-out accuracy did not regress",
      Number.isFinite(postAcc) && postAcc >= baseAcc - 1e-9,
      `base=${baseAcc}% post=${postAcc}%`,
    );

    // ---- export the GRPO adapter to OPFS and re-equip it ----
    await testid("trainer-export").click();
    const exportOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("exported"),
      Date.now() + 60_000,
    );
    step("GRPO adapter exported to OPFS", exportOk, (await textOf("trainer-last-action")).trim());

    await testid("trainer-equip").click();
    const equipOk = await waitUntil(
      async () => (await textOf("trainer-last-action")).includes("re-equipped"),
      Date.now() + 120_000,
    );
    step("GRPO adapter re-equipped from OPFS", equipOk, (await textOf("trainer-last-action")).trim());
  } catch (e) {
    step("run completed without fatal error", false, String(e).slice(0, 200));
    try {
      const url = page.url();
      const bodyText = (await page.locator("body").textContent({ timeout: 3000 })) || "";
      const ids = await page.$$eval("[data-testid]", (els) =>
        [...new Set(els.map((el) => el.getAttribute("data-testid")))].join(","),
      );
      console.log("  DEBUG url:", url);
      console.log("  DEBUG testids:", ids.slice(0, 400));
      console.log("  DEBUG body:", bodyText.replace(/\s+/g, " ").slice(0, 400));
    } catch (dbgErr) {
      console.log("  DEBUG capture failed:", String(dbgErr).slice(0, 120));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((s) => s.name).join("; "));
    process.exit(1);
  }
  console.log("GRPO E2E: ALL PASS");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
