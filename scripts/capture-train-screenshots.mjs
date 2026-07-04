#!/usr/bin/env node
/**
 * Playwright screenshots saved on every train-dev deploy.
 * Output: artifacts/deploy-screenshots/*.png
 */
import { chromium } from "playwright";
import {
  TRAIN_BASE,
  assertNoFatalRender,
  ensureDialKitReady,
  ensureTrainVaultUnlocked,
  saveDeployScreenshot,
  skipJourneyGate,
  waitForAppShell,
} from "./lib/train-harness.mjs";

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 900 } })
).newPage();

try {
  await page.goto(`${TRAIN_BASE}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(3_000);
  await assertNoFatalRender(page);
  await saveDeployScreenshot(page, "01-vault-setup");

  await page.goto(`${TRAIN_BASE}/?dialkit=1`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2_000);
  await assertNoFatalRender(page);
  await saveDeployScreenshot(page, "02-dialkit-vault");

  await ensureTrainVaultUnlocked(page);
  await Promise.race([
    page.locator("[data-journey-screen]").first().waitFor({ state: "visible", timeout: 15_000 }),
    page.locator('[data-slot="sidebar"]').first().waitFor({ state: "visible", timeout: 15_000 }),
  ]).catch(() => {});
  await skipJourneyGate(page);
  await ensureTrainVaultUnlocked(page);
  await waitForAppShell(page);
  await ensureDialKitReady(page);
  await page.waitForTimeout(1_000);
  await saveDeployScreenshot(page, "03-app-shell-dialkit");
} finally {
  await browser.close();
}
