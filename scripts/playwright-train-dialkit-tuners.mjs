#!/usr/bin/env node
/**
 * Playwright harness: prove the DialKit tuners actually drive the live layout
 * on train.public.computer — not just that the panel renders.
 *
 * Drags the real "Sidebar Width" slider in the App shell dial folder and
 * asserts (1) the --dialkit-sidebar-width CSS var moves, (2) the rendered
 * sidebar's pixel width follows it, and (3) the value survives a reload
 * (localStorage persistence).
 *
 * Usage:
 *   bun run harness:train-dialkit-tuners
 *   ACCOUNTBOX_TRAIN_VAULT_PASSWORD='pw' bun run harness:train-dialkit-tuners
 */
import { chromium } from "playwright";
import {
  TRAIN_BASE,
  assertNoFatalRender,
  ensureDialKitReady,
  ensureTrainVaultUnlocked,
  skipJourneyGate,
  waitForAppShell,
} from "./lib/train-harness.mjs";

const target = `${TRAIN_BASE}/?dialkit=1`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

const errors = [];
page.on("pageerror", (error) => errors.push(error.stack || error.message));

function readShell() {
  return page.evaluate(() => {
    const root = document.documentElement;
    const sidebar = document.querySelector('[data-slot="sidebar"]');
    return {
      cssVar: root.style.getPropertyValue("--dialkit-sidebar-width").trim(),
      sidebarPx: sidebar
        ? Math.round(sidebar.getBoundingClientRect().width)
        : null,
    };
  });
}

async function openAppShellFolder() {
  const folder = page
    .locator(".dialkit-folder", {
      has: page.locator(".dialkit-folder-title", { hasText: /^App shell$/i }),
    })
    .first();
  await folder.waitFor({ state: "visible", timeout: 30_000 });
  // Expand if the sliders are hidden (folder headers toggle on click).
  const slider = folder.locator(".dialkit-slider-wrapper").first();
  if (!(await slider.isVisible().catch(() => false))) {
    await folder.locator(".dialkit-folder-header").first().click();
    await slider.waitFor({ state: "visible", timeout: 10_000 });
  }
  return folder;
}

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
  await ensureTrainVaultUnlocked(page);

  // The journey screen mounts a beat after unlock; wait for it (or the shell)
  // before deciding whether to skip, otherwise skipJourneyGate races and no-ops.
  await Promise.race([
    page.locator("[data-journey-screen]").first().waitFor({ state: "visible", timeout: 15_000 }),
    page.locator('[data-slot="sidebar"]').first().waitFor({ state: "visible", timeout: 15_000 }),
  ]).catch(() => {});
  await skipJourneyGate(page);
  await ensureTrainVaultUnlocked(page);
  await waitForAppShell(page);
  await page.locator('[data-slot="sidebar"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await ensureDialKitReady(page);
  await page.waitForTimeout(1_000);

  const before = await readShell();
  if (before.sidebarPx == null) {
    throw new Error("Sidebar element not found — cannot measure layout.");
  }
  console.log(
    `baseline: sidebar ${before.sidebarPx}px (var: ${before.cssVar || "unset"})`,
  );

  console.log("== drag Sidebar Width slider to max ==");
  const folder = await openAppShellFolder();
  const wrapper = folder
    .locator(".dialkit-slider-wrapper", {
      has: page.locator(".dialkit-slider-label", { hasText: /sidebar width/i }),
    })
    .first();
  await wrapper.waitFor({ state: "visible", timeout: 10_000 });
  const track = wrapper.locator(".dialkit-slider").first();
  const box = await track.boundingBox();
  if (!box) throw new Error("Sidebar Width slider track has no bounding box.");

  // Pointer-drag from the middle of the track to its right edge (value → max).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(1_000);

  const after = await readShell();
  console.log(`after drag: sidebar ${after.sidebarPx}px (var: ${after.cssVar})`);

  if (!after.cssVar || after.cssVar === before.cssVar) {
    throw new Error(
      `--dialkit-sidebar-width did not change (before: '${before.cssVar}', after: '${after.cssVar}') — tuner not wired to CSS vars.`,
    );
  }
  const expectedPx = Math.round(Number.parseFloat(after.cssVar) * 16);
  if (Number.isNaN(expectedPx)) {
    throw new Error(`--dialkit-sidebar-width is not a rem value: '${after.cssVar}'`);
  }
  if (Math.abs(after.sidebarPx - expectedPx) > 8) {
    throw new Error(
      `Sidebar did not follow the dial: var says ${expectedPx}px but rendered ${after.sidebarPx}px — layout not consuming the CSS var.`,
    );
  }
  if (Math.abs(after.sidebarPx - before.sidebarPx) < 32) {
    throw new Error(
      `Sidebar width barely moved (${before.sidebarPx}px → ${after.sidebarPx}px) — drag had no layout effect.`,
    );
  }

  console.log("== reload: dial value must persist ==");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await ensureTrainVaultUnlocked(page);
  await skipJourneyGate(page);
  await waitForAppShell(page);
  await page.locator('[data-slot="sidebar"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const reloaded = await readShell();
  console.log(
    `after reload: sidebar ${reloaded.sidebarPx}px (var: ${reloaded.cssVar})`,
  );
  if (reloaded.cssVar !== after.cssVar) {
    throw new Error(
      `Dial value did not persist across reload (was '${after.cssVar}', now '${reloaded.cssVar}').`,
    );
  }
  if (Math.abs((reloaded.sidebarPx ?? 0) - after.sidebarPx) > 8) {
    throw new Error(
      `Persisted dial not applied after reload: ${after.sidebarPx}px → ${reloaded.sidebarPx}px.`,
    );
  }

  const fatal = errors.filter((entry) =>
    /Minified React error|Maximum update depth|Hydration failed/i.test(entry),
  );
  if (fatal.length > 0) {
    throw new Error(`Fatal page errors during tuner drive:\n${fatal.join("\n\n")}`);
  }

  console.log("PASS train DialKit tuner harness");
  console.log(`  sidebar: ${before.sidebarPx}px → ${after.sidebarPx}px (drag), persisted after reload`);
} finally {
  await browser.close();
}
