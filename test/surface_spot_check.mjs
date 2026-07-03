// SURFACE SPOT CHECK — boots the production build and walks onboarding at
// three viewports (phone 390px, foldable ~840px unfolded, desktop 1280px).
// Two worlds per viewport:
//   fresh vault      -> the JOURNEY gate (no sidebar/board/compose exists)
//   completed journey -> today's shell (board, agent tile, connect tile)
// The completed world is seeded via localStorage (grandfather-shaped state);
// earning the journey for real is the deployed E2E's job.
// Screenshots land in /tmp/surface-*.png for eyeballing.
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3993;
const PW = "surface-check-master-pw-01";

const JOURNEY_DONE = JSON.stringify({
  v: 1,
  done: ["chat-agent", "first-skill", "connect-account"],
  completedVia: "grandfathered",
});

let ok = true;
function step(name, pass, detail = "") {
  ok &&= pass;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

try {
  execSync(
    `rm -f /tmp/surface.db && cd ${ROOT} && DATABASE_URL=file:/tmp/surface.db bunx prisma db push --accept-data-loss >/dev/null 2>&1`,
  );
} catch {}
const srv = spawn("node", [join(ROOT, ".output/server/index.mjs")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: "file:/tmp/surface.db",
    BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
    BETTER_AUTH_SECRET: "surface-check-secret-0123456789abc",
  },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await launchWebGpuBrowser({ headless: false });
const BASE = `http://127.0.0.1:${PORT}`;

async function createVault(page) {
  await page.getByPlaceholder("Master password").fill(PW);
  await page.getByPlaceholder("Confirm").fill(PW);
  await page.getByRole("button", { name: "Setup Secure Workspace" }).click();
}

/** Context whose journey is already complete (existing-user shape). */
async function completedContext(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await ctx.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ["accountbox:journey", JOURNEY_DONE],
  );
  return ctx;
}

try {
  // ---------- desktop 1280x800: fresh vault -> journey ----------
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    const pitch = await page
      .getByText("A local agent, not a cloud one.")
      .isVisible();
    step("desktop: pitch panel beside setup card", pitch);
    await page.screenshot({ path: "/tmp/surface-desktop-gate.png" });
    await createVault(page);

    await page
      .locator('[data-journey-screen="overview"]')
      .waitFor({ timeout: 30_000 });
    step("desktop: journey gate after fresh vault", true);
    const journeyPitch = await page
      .getByText("You build this workspace yourself.")
      .isVisible();
    step("desktop: journey two-column layout (pitch visible)", journeyPitch);
    const s1 = await page
      .locator('[data-journey-step="chat-agent"]')
      .getAttribute("data-step-state");
    const s2 = await page
      .locator('[data-journey-step="first-skill"]')
      .getAttribute("data-step-state");
    step(
      "desktop: step 1 active, step 2 locked",
      s1 === "active" && s2 === "locked",
      `${s1}/${s2}`,
    );
    const noSidebar =
      (await page.locator('[data-slot="sidebar"]').count()) === 0;
    const noConnectTile =
      (await page.getByRole("button", { name: "Connect Gmail" }).count()) === 0;
    const noChatTile =
      (await page
        .getByPlaceholder("e.g. Find all unread from manager this week...")
        .count()) === 0;
    step(
      "desktop: no sidebar/board/agent-tile in journey",
      noSidebar && noConnectTile && noChatTile,
    );
    await page.screenshot({ path: "/tmp/surface-desktop-journey.png" });
    await ctx.close();
  }

  // ---------- desktop 1280x800: completed journey -> today's shell ----------
  {
    const ctx = await completedContext({ width: 1280, height: 800 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    await createVault(page);

    const chatInput = page.getByPlaceholder(
      "e.g. Find all unread from manager this week...",
    );
    await chatInput.waitFor({ timeout: 30_000 });
    step("desktop(done): agent tile open by default", true);
    const connect = await page
      .getByRole("button", { name: "Connect Gmail" })
      .isVisible();
    step("desktop(done): connect-Gmail tile on the board", connect);
    const navAgent = await page.getByText("Agent chat").isVisible();
    step("desktop(done): sidebar Local agent nav entry", navAgent);
    await page.screenshot({ path: "/tmp/surface-desktop-board.png" });
    await ctx.close();
  }

  // ---------- phone 390x844: fresh vault -> journey (stacked) ----------
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    const genBtn = page.getByRole("button", {
      name: "Generate a recovery key",
    });
    await genBtn.waitFor({ timeout: 15_000 });
    step("phone: generate-first CTA", true);
    const pitchHidden = !(await page
      .getByText("A local agent, not a cloud one.")
      .isVisible()
      .catch(() => false));
    step("phone: pitch panel hidden", pitchHidden);
    await page.screenshot({ path: "/tmp/surface-phone-gate.png" });

    // manual path still reachable
    await page.getByText("Set my own password instead").click();
    await page.getByPlaceholder("Master password").waitFor({ timeout: 5_000 });
    step("phone: manual password path reachable", true);
    await createVault(page);

    await page
      .locator('[data-journey-screen="overview"]')
      .waitFor({ timeout: 30_000 });
    step("phone: journey gate after fresh vault", true);
    const journeyPitchHidden = !(await page
      .getByText("You build this workspace yourself.")
      .isVisible()
      .catch(() => false));
    step("phone: journey stacked (pitch hidden)", journeyPitchHidden);
    const noLauncher =
      (await page.getByRole("button", { name: "Local agent" }).count()) === 0;
    step("phone: no floating agent launcher in journey", noLauncher);
    await page.screenshot({ path: "/tmp/surface-phone-journey.png" });
    await ctx.close();
  }

  // ---------- phone 390x844: completed journey -> connect + agent sheet ----------
  {
    const ctx = await completedContext(
      { width: 390, height: 844 },
      { isMobile: true, hasTouch: true },
    );
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page
      .getByRole("button", { name: "Generate a recovery key" })
      .waitFor({ timeout: 15_000 });
    await page.getByText("Set my own password instead").click();
    await page.getByPlaceholder("Master password").waitFor({ timeout: 5_000 });
    await createVault(page);

    await page
      .getByRole("button", { name: "Connect Gmail" })
      .waitFor({ timeout: 30_000 });
    step("phone(done): full-screen connect prompt", true);
    await page.screenshot({ path: "/tmp/surface-phone-connect.png" });

    // floating launcher -> full-screen sheet
    await page.getByRole("button", { name: "Local agent" }).click();
    const sheetInput = page.getByPlaceholder(
      "e.g. Find all unread from manager this week...",
    );
    await sheetInput.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400); // let the open transition settle
    const box = await page.locator('[data-slot="sheet-content"]').boundingBox();
    step(
      "phone(done): agent opens as full-screen sheet",
      !!box && box.height >= 800 && box.width >= 380,
      box ? `${box.width}x${box.height}` : "no sheet box",
    );
    await page.screenshot({ path: "/tmp/surface-phone-agent.png" });
    await ctx.close();
  }

  // ---------- foldable-ish 840x800: fresh -> journey, done -> board ----------
  {
    const ctx = await browser.newContext({
      viewport: { width: 840, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    await createVault(page);
    await page
      .locator('[data-journey-screen="overview"]')
      .waitFor({ timeout: 30_000 });
    step("foldable-width: journey gate after fresh vault", true);
    await page.screenshot({ path: "/tmp/surface-foldable-journey.png" });
    await ctx.close();

    const ctx2 = await completedContext({ width: 840, height: 800 });
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/`);
    await page2
      .getByPlaceholder("Master password")
      .waitFor({ timeout: 15_000 });
    await createVault(page2);
    await page2
      .getByPlaceholder("e.g. Find all unread from manager this week...")
      .waitFor({ timeout: 30_000 });
    const connect = await page2
      .getByRole("button", { name: "Connect Gmail" })
      .isVisible();
    step("foldable-width(done): board with connect tile + agent tile", connect);
    await page2.screenshot({ path: "/tmp/surface-foldable-board.png" });
    await ctx2.close();
  }
} catch (e) {
  step("spot check flow", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  srv.kill();
}

console.log(ok ? "\nSURFACE SPOT CHECK PASS" : "\nSURFACE SPOT CHECK FAIL");
process.exit(ok ? 0 : 1);
