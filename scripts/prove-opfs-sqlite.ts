#!/usr/bin/env bun
/**
 * Browser proof for Phase 1:
 * write a vault_envelope-shaped sentinel into OPFS SQLite, reload the page,
 * then read the same payload back from a fresh app load.
 */

import { chromium } from "playwright";

const baseUrl = process.env.ACCOUNTBOX_PROOF_URL ?? "http://localhost:3001";
const token = `phase1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const proofUrl = `${baseUrl}/opfs-proof?mode=write&token=${encodeURIComponent(token)}`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(proofUrl, { waitUntil: "networkidle" });
  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  if (!isolated) {
    throw new Error(
      "page is not cross-origin isolated; OPFS SQLite VFS cannot run",
    );
  }
  await page.waitForSelector('[data-opfs-proof-status="written"]', {
    timeout: 20_000,
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-opfs-proof-status="pass"]', {
    timeout: 20_000,
  });
  const text = await page.locator("[data-opfs-proof-json]").textContent();
  if (!text?.includes(token)) {
    throw new Error("proof payload did not contain the expected token");
  }
  console.log(`PASS (OPFS SQLite reload proof) ${token}`);
} finally {
  await browser.close();
}
