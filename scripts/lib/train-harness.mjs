/** Shared helpers for Playwright harnesses against train.public.computer. */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _DIR = dirname(fileURLToPath(import.meta.url));

export const DEPLOY_SCREENSHOT_DIR =
  process.env.ACCOUNTBOX_DEPLOY_SCREENSHOT_DIR ??
  join(_DIR, "../../artifacts/deploy-screenshots");

export const TRAIN_BASE = (
  process.env.ACCOUNTBOX_TRAIN_URL ??
  process.env.ACCOUNTBOX_SMOKE_URL ??
  "https://train.public.computer"
)
  .replace(/\?.*$/, "")
  .replace(/\/$/, "");

export const DIALKIT_PROJECT_KEY = "accountbox-train";
export const DIALKIT_SESSION_KEY = `dialkit:dev-session:v1:${DIALKIT_PROJECT_KEY}`;

export const HARNESS_VAULT_PASSWORD =
  process.env.ACCOUNTBOX_TRAIN_VAULT_PASSWORD ??
  "playwright-train-dialkit-harness-v1";

export const JOURNEY_GRANDFATHERED = JSON.stringify({
  v: 1,
  done: ["chat-agent", "first-skill", "connect-account"],
  completedVia: "grandfathered",
});

/** Unlock vault (setup on first run in this browser profile, unlock on reload). */
export async function ensureTrainVaultUnlocked(page, password = HARNESS_VAULT_PASSWORD) {
  const setupHeading = page.getByRole("heading", { name: /Set a master password/i });
  const unlockHeading = page.getByRole("heading", { name: /Unlock workspace/i });
  const unlockButton = page.getByRole("button", { name: "Unlock" });

  await Promise.race([
    setupHeading.waitFor({ state: "visible", timeout: 45_000 }),
    unlockHeading.waitFor({ state: "visible", timeout: 45_000 }),
    unlockButton.waitFor({ state: "visible", timeout: 45_000 }),
    page.locator('[data-slot="sidebar"]').waitFor({ state: "visible", timeout: 45_000 }),
    page.getByText("Agent notes").waitFor({ state: "visible", timeout: 45_000 }),
  ]).catch(() => {});

  if (await setupHeading.isVisible().catch(() => false)) {
    await page.getByPlaceholder("Master password").fill(password);
    await page.getByPlaceholder("Confirm").fill(password);
    await page.getByRole("button", { name: "Setup Secure Workspace" }).click();
    await Promise.race([
      page.locator('[data-journey-screen="overview"]').waitFor({ timeout: 60_000 }),
      waitForAppShell(page),
    ]);
    return "setup";
  }

  if (
    (await unlockHeading.isVisible().catch(() => false)) ||
    (await unlockButton.isVisible().catch(() => false))
  ) {
    await page.getByPlaceholder("Master password").fill(password);
    await page.getByRole("button", { name: "Unlock" }).click();
    await Promise.race([
      page.locator('[data-journey-screen="overview"]').waitFor({ timeout: 60_000 }),
      waitForAppShell(page),
    ]);
    return "unlock";
  }

  return "already-open";
}

/** Skip the journey gate so the mail shell + DialKit panels mount. May reload. */
export async function skipJourneyGate(page) {
  const onJourney = await page
    .locator('[data-journey-screen="overview"]')
    .isVisible({ timeout: 2_000 })
    .catch(() => false);
  if (!onJourney) return false;

  await page.evaluate((payload) => {
    localStorage.setItem("accountbox:journey", payload);
  }, JOURNEY_GRANDFATHERED);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  return true;
}

export async function waitForAppShell(page) {
  const desktopSidebar = page.locator('[data-slot="sidebar"]');
  const mobileHeader = page.getByRole("button", { name: "Search" });
  const inboxBoard = page.locator("[data-pane-id], .dialkit-panel");

  await Promise.race([
    desktopSidebar.waitFor({ state: "visible", timeout: 60_000 }),
    mobileHeader.waitFor({ state: "visible", timeout: 60_000 }),
    inboxBoard.first().waitFor({ state: "visible", timeout: 60_000 }),
  ]);
}

export async function ensureDialKitReady(page) {
  await page
    .locator(".dialkit-feedback-panel, .dialkit-panel")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("Agent notes").first().waitFor({ state: "visible", timeout: 15_000 });
}

export async function readDialkitSession(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, DIALKIT_SESSION_KEY);
}

/** Pick a visible non-DialKit element and tag it through the Agent notes UI. */
export async function tagRandomComponent(page) {
  const tagButton = page.locator(
    '.dialkit-feedback-panel button:has-text("Tag element")',
  );
  await tagButton.click();

  const target = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("body *")].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest(".dialkit-root")) return false;
      if (node.closest("[data-journey-screen]")) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 28 || rect.height < 18) return false;
      if (rect.bottom < 8 || rect.top > window.innerHeight - 8) return false;
      if (rect.right < 8 || rect.left > window.innerWidth - 8) return false;
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (Number(style.opacity) < 0.05) return false;
      return true;
    });
    const pick =
      candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    if (!pick) return null;
    const rect = pick.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      tag: pick.tagName.toLowerCase(),
    };
  });

  if (!target) {
    throw new Error("No taggable page element found outside DialKit.");
  }

  await page.mouse.click(target.x, target.y);
  await page
    .locator(".dialkit-feedback-target strong", { hasText: "Tagged" })
    .waitFor({ timeout: 10_000 });

  return target;
}

export async function saveAgentNote(page, comment) {
  await page.locator(".dialkit-feedback-textarea").fill(comment);
  await page
    .locator('.dialkit-feedback-panel button:has-text("Save note")')
    .click();
  await page
    .locator(".dialkit-feedback-status", { hasText: "Note saved locally" })
    .waitFor({ timeout: 10_000 });
}

export function findOpenNote(session, comment) {
  if (!session?.notes?.length) return null;
  return session.notes.find(
    (note) => note.status === "open" && note.comment === comment,
  );
}

export async function assertNoFatalRender(page) {
  const body = await page.locator("body").innerText({ timeout: 10_000 });
  const fatal = /Something went wrong|Show Error|Minified React error/i;
  if (fatal.test(body)) {
    throw new Error(`Fatal render on train:\n${body.slice(0, 800)}`);
  }
}

export function ensureScreenshotDir() {
  mkdirSync(DEPLOY_SCREENSHOT_DIR, { recursive: true });
}

/** Save a PNG under artifacts/deploy-screenshots/ and log the path. */
export async function saveDeployScreenshot(page, name) {
  ensureScreenshotDir();
  const filePath = join(DEPLOY_SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`screenshot: ${filePath}`);
  return filePath;
}
