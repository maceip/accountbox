#!/usr/bin/env bun
/**
 * Browser proof for Phase 3 storage:
 * write Google provider config + a connected Gmail account through the real
 * encrypted OPFS provider store, reload the page, then verify the decrypted
 * records survive and raw OPFS rows do not contain the fake token/client/email.
 *
 * This deliberately does not claim live Google OAuth/Gmail success.
 */

import { chromium } from "playwright";

const baseUrl = process.env.ACCOUNTBOX_PROOF_URL ?? "http://localhost:3001";
const token = `phase3-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const secret = `phase3-access-token-${token}`;
const proofUrl = `${baseUrl}/opfs-connections-proof?mode=write&token=${encodeURIComponent(token)}`;

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
  await page.waitForSelector('[data-opfs-connections-proof-status="written"]', {
    timeout: 20_000,
  });
  const writtenText = await page.locator("body").innerText();
  if (writtenText.includes(secret)) {
    throw new Error("proof page leaked the fake access token after write");
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-opfs-connections-proof-status="pass"]', {
    timeout: 20_000,
  });
  await page.waitForSelector(
    '[data-opfs-connections-proof-plaintext="absent"]',
    { timeout: 20_000 },
  );
  const passText = await page.locator("body").innerText();
  if (passText.includes(secret)) {
    throw new Error("proof page leaked the fake access token after reload");
  }

  console.log(`PASS (encrypted OPFS connections reload proof) ${token}`);
} finally {
  await browser.close();
}
