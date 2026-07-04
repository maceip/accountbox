#!/usr/bin/env node
/**
 * Playwright harness: unlock train.public.computer, leave a DialKit agent note
 * on a random on-page component, and validate it in localStorage + the UI.
 *
 * Notes persist in browser localStorage (same as manual use). No API shortcut.
 *
 * Usage:
 *   bun run harness:train-dialkit-note
 *   ACCOUNTBOX_TRAIN_VAULT_PASSWORD='your-vault-pw' bun run harness:train-dialkit-note
 *   ACCOUNTBOX_TRAIN_STORAGE_STATE=/tmp/train-state.json bun run harness:train-dialkit-note
 */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import {
  TRAIN_BASE,
  HARNESS_VAULT_PASSWORD,
  assertNoFatalRender,
  ensureDialKitReady,
  ensureTrainVaultUnlocked,
  findOpenNote,
  readDialkitSession,
  saveAgentNote,
  skipJourneyGate,
  tagRandomComponent,
  waitForAppShell,
} from "./lib/train-harness.mjs";

const target = `${TRAIN_BASE}/?dialkit=1`;
const noteText = `playwright harness ${randomUUID()}`;
const storageStatePath = process.env.ACCOUNTBOX_TRAIN_STORAGE_STATE;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(storageStatePath ? { storageState: storageStatePath } : {}),
});
const page = await context.newPage();

const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => {
  errors.push(error.stack || error.message);
});

try {
  console.log(`== load ${target} ==`);
  const response = await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response?.ok()) {
    throw new Error(`HTTP ${response?.status() ?? "no response"} loading ${target}`);
  }
  await page.waitForTimeout(2_000);
  await assertNoFatalRender(page);

  console.log("== unlock vault ==");
  const vaultAction = await ensureTrainVaultUnlocked(page);
  console.log(`vault: ${vaultAction} (password from env or harness default)`);

  console.log("== enter app shell ==");
  if (await skipJourneyGate(page)) {
    console.log("journey gate skipped via grandfathered localStorage");
    await ensureTrainVaultUnlocked(page);
  }
  await waitForAppShell(page);

  await assertNoFatalRender(page);
  await ensureDialKitReady(page);

  console.log("== tag random component + save note ==");
  const tagged = await tagRandomComponent(page);
  console.log(`tagged ${tagged.tag} at (${Math.round(tagged.x)}, ${Math.round(tagged.y)})`);
  await saveAgentNote(page, noteText);

  console.log("== validate note (same session) ==");
  const session = await readDialkitSession(page);
  const saved = findOpenNote(session, noteText);
  if (!saved) {
    throw new Error(
      `Note missing from ${session ? "localStorage session" : "localStorage (no session key)"}`,
    );
  }
  if (!saved.selector) {
    throw new Error("Saved note has no CSS selector from tagged element.");
  }

  await page
    .locator(".dialkit-feedback-note p", { hasText: noteText })
    .waitFor({ timeout: 10_000 });

  console.log("== validate note survives reload + unlock ==");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await ensureTrainVaultUnlocked(page);
  if (await skipJourneyGate(page)) {
    await ensureTrainVaultUnlocked(page);
  }
  await waitForAppShell(page);
  await ensureDialKitReady(page);

  const sessionAfterReload = await readDialkitSession(page);
  const persisted = findOpenNote(sessionAfterReload, noteText);
  if (!persisted) {
    throw new Error("Note did not persist in localStorage after reload + unlock.");
  }

  await page
    .locator(".dialkit-feedback-note p", { hasText: noteText })
    .waitFor({ timeout: 10_000 });

  const fatalConsole = errors.filter((entry) =>
    /Minified React error|Maximum update depth|Hydration failed|Something went wrong/i.test(
      entry,
    ),
  );
  if (fatalConsole.length > 0) {
    throw new Error(`Console errors during harness:\n${fatalConsole.join("\n\n")}`);
  }

  if (storageStatePath) {
    await context.storageState({ path: storageStatePath });
    console.log(`storage state updated: ${storageStatePath}`);
  }

  console.log(`PASS train DialKit note harness`);
  console.log(`  note: ${noteText}`);
  console.log(`  selector: ${saved.selector}`);
  console.log(`  vault password: ${HARNESS_VAULT_PASSWORD === process.env.ACCOUNTBOX_TRAIN_VAULT_PASSWORD ? "(from ACCOUNTBOX_TRAIN_VAULT_PASSWORD)" : "(harness default — fresh profile setup)"}`);
} finally {
  await browser.close();
}
