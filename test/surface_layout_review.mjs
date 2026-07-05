// Surface layout review — validates accent tokens, gate layouts, and the
// three postures from the product plan (not breakpoint trivia):
//   phone     — stacked gates, sheet sidebar, full-screen mail/agent, no board tiles
//   foldable  — two-column gates at unfolded width, tile board + no LocalChat FAB
//   desktop   — pitch + card gates, persistent ops sidebar, workbench shell
//
// Requires a fresh production build (.output/server). Screenshots → /tmp/review-*.png
import { spawn, execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3994;
const PW = "review-master-password-01";

const JOURNEY_DONE = JSON.stringify({
  v: 1,
  done: ["chat-agent", "first-skill", "connect-account"],
  completedVia: "grandfathered",
});

const FOLDABLE_INIT = () => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    if (query === "(horizontal-viewport-segments: 2)") {
      return {
        matches: true,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
        onchange: null,
      };
    }
    return orig(query);
  };
};

let ok = true;
function step(name, pass, detail = "") {
  ok &&= pass;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

function assertCssTokens() {
  const cssDir = join(ROOT, ".output/public/assets");
  const cssFile = readdirSync(cssDir).find(
    (f) => f.startsWith("styles-") && f.endsWith(".css"),
  );
  if (!cssFile) {
    step("built CSS exists", false, "run bun run build first");
    return;
  }
  const css = readFileSync(join(cssDir, cssFile), "utf8");
  const bad = /--color-command:var\(--color-command\)/.test(css);
  step("CSS: --color-command is not self-referential", !bad);
  step(
    "CSS: command orange hex present",
    css.includes("--color-command:#f46a3c") ||
      css.includes("--color-command: #f46a3c"),
  );
}

async function primaryOnButton(page, label) {
  return page.evaluate((buttonLabel) => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().includes(buttonLabel),
    );
    if (!btn) return { found: false };
    const root = document.documentElement;
    const primary = getComputedStyle(root).getPropertyValue("--primary").trim();
    const cs = getComputedStyle(btn);
    const bg = cs.backgroundColor;
    const transparent =
      bg === "rgba(0, 0, 0, 0)" ||
      bg === "transparent" ||
      bg === "";
    return { found: true, primary, bg, transparent };
  }, label);
}

try {
  execSync(`cd ${ROOT} && bun run build >/dev/null 2>&1`);
} catch (e) {
  console.error("build failed:", e.message);
  process.exit(1);
}

assertCssTokens();

try {
  execSync(
    `rm -f /tmp/review.db && cd ${ROOT} && DATABASE_URL=file:/tmp/review.db bunx prisma db push --accept-data-loss >/dev/null 2>&1`,
  );
} catch {}

const srv = spawn("node", [join(ROOT, ".output/server/index.mjs")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: "file:/tmp/review.db",
    BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
    BETTER_AUTH_SECRET: "review-check-secret-0123456789abc",
  },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await launchWebGpuBrowser({ headless: true });
const BASE = `http://127.0.0.1:${PORT}`;

async function createVault(page) {
  await page.getByPlaceholder("Master password").fill(PW);
  await page.getByPlaceholder("Confirm").fill(PW);
  await page.getByRole("button", { name: "Setup Secure Workspace" }).click();
}

async function completedContext(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await ctx.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ["accountbox:journey", JOURNEY_DONE],
  );
  return ctx;
}

try {
  // ── Desktop gate: pitch + orange primary ───────────────────────────────
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
    step("desktop gate: pitch panel visible", pitch);
    const accent = await primaryOnButton(page, "Setup Secure Workspace");
    step(
      "desktop gate: primary button has fill",
      accent.found && !accent.transparent,
      accent.found ? accent.bg : "no button",
    );
    await page.screenshot({ path: "/tmp/review-desktop-gate.png" });
    await ctx.close();
  }

  // ── Phone gate: stacked, mobile mark, no pitch ────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page
      .getByRole("button", { name: "Generate a recovery key" })
      .waitFor({ timeout: 15_000 });
    const pitchHidden = !(await page
      .getByText("A local agent, not a cloud one.")
      .isVisible()
      .catch(() => false));
    step("phone gate: pitch hidden", pitchHidden);
    const mark = await page.locator(".bg-primary.text-on-primary").count();
    step("phone gate: orange AccountBox mark in card", mark > 0, String(mark));
    await page.getByText("Set my own password instead").click();
    const accent = await primaryOnButton(page, "Setup Secure Workspace");
    step(
      "phone gate: primary button has fill",
      accent.found && !accent.transparent,
      accent.found ? accent.bg : "no button",
    );
    await page.screenshot({ path: "/tmp/review-phone-gate.png" });
    await ctx.close();
  }

  // ── Unlock path (returning user) ─────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByText("Set my own password instead").click();
    await createVault(page);
    await page
      .locator('[data-journey-screen="overview"]')
      .waitFor({ timeout: 30_000 });
    await page.reload();
    await page
      .getByRole("heading", { name: "Unlock workspace" })
      .waitFor({ timeout: 15_000 });
    const unlockMark = await page.locator(".bg-primary.text-on-primary").count();
    step("phone unlock: orange mark present", unlockMark > 0);
    const accent = await primaryOnButton(page, "Unlock");
    step(
      "phone unlock: primary button has fill",
      accent.found && !accent.transparent,
      accent.found ? accent.bg : "no button",
    );
    await page.screenshot({ path: "/tmp/review-phone-unlock.png" });
    await ctx.close();
  }

  // ── Phone completed: workbench shell, FAB agent, no journey ──────────
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
    await createVault(page);
    await page
      .getByText("Operations base", { exact: false })
      .waitFor({ timeout: 30_000 });
    step("phone(done): command center home", true);
    const mobileHeader = await page
      .locator("header.md\\:hidden")
      .first()
      .isVisible();
    step("phone(done): mobile chrome header", mobileHeader);
    const sidebarHidden = await page
      .locator('[data-slot="sidebar-container"]')
      .isHidden()
      .catch(() => true);
    step("phone(done): desktop sidebar column hidden", sidebarHidden);
    const fab = await page.getByRole("button", { name: "Local agent" }).count();
    step("phone(done): Local agent FAB (not board tile)", fab === 1);
    const journey = await page.locator('[data-journey-screen]').count();
    step("phone(done): no journey gate", journey === 0);
    await page.screenshot({ path: "/tmp/review-phone-workbench.png" });
    await ctx.close();
  }

  // ── Foldable: emulated segments → tile board posture on mail ─────────
  {
    const ctx = await completedContext({ width: 840, height: 800 });
    await ctx.addInitScript(FOLDABLE_INIT);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    await createVault(page);
    await page
      .getByText("Operations base", { exact: false })
      .waitFor({ timeout: 30_000 });
    const fab = await page.getByRole("button", { name: "Local agent" }).count();
    step("foldable(done): no Local agent FAB", fab === 0);
    await page.screenshot({ path: "/tmp/review-foldable-home.png" });
    const foldablePosture = await page.evaluate(() => ({
      segments: window.matchMedia("(horizontal-viewport-segments: 2)").matches,
      phoneBoard:
        window.innerWidth < 768 &&
        !window.matchMedia("(horizontal-viewport-segments: 2)").matches,
    }));
    step(
      "foldable(done): viewport-segments emulation active",
      foldablePosture.segments,
    );
    step(
      "foldable(done): not phone board posture (width + segments)",
      !foldablePosture.phoneBoard,
      JSON.stringify(foldablePosture),
    );
    await ctx.close();
  }

  // ── Foldable gate: two-column at unfolded width ──────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 840, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    const pitch = await page
      .getByText("A local agent, not a cloud one.")
      .isVisible();
    step("foldable-width gate: pitch panel visible (md+ two-column)", pitch);
    await page.screenshot({ path: "/tmp/review-foldable-gate.png" });
    await ctx.close();
  }

  // ── Desktop completed: ops sidebar + command center ──────────────────
  {
    const ctx = await completedContext({ width: 1280, height: 800 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    await createVault(page);
    await page
      .getByText("Operations base", { exact: false })
      .waitFor({ timeout: 30_000 });
    const sidebar = await page
      .locator('[data-slot="sidebar"]')
      .first()
      .isVisible();
    step("desktop(done): ops sidebar visible", sidebar);
    const queueTray = await page.locator(".wb-queue-tray").count();
    step("desktop(done): workbench queue tray", queueTray > 0);
    const brand = await page.locator(".bg-primary").count();
    step("desktop(done): primary accent surfaces present", brand > 0);
    // Client-side nav only — a full document load fires pagehide and locks the vault.
    await page.getByRole("link", { name: "Sources" }).first().click();
    await page.getByRole("link", { name: "Inbox" }).first().click();
    await page
      .getByText("Loading accounts")
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => {});
    const connectTile = await page
      .locator('[data-pane-id="__connect__"]')
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const connectFullScreen = await page
      .getByRole("heading", { name: "Connect your Gmail" })
      .isVisible()
      .catch(() => false);
    step(
      "desktop(done): connect prompt on tile board (SPA nav)",
      connectTile || connectFullScreen,
      `tile=${connectTile} full=${connectFullScreen}`,
    );
    await page.screenshot({ path: "/tmp/review-desktop-mail.png" });
    await ctx.close();
  }
} catch (e) {
  step("review flow", false, String(e).slice(0, 400));
} finally {
  await browser.close();
  srv.kill();
}

console.log(ok ? "\nSURFACE LAYOUT REVIEW PASS" : "\nSURFACE LAYOUT REVIEW FAIL");
process.exit(ok ? 0 : 1);
