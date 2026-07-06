#!/usr/bin/env bun
/**
 * Browser proof for Phase 2:
 * create a vault through the real setup UI, reload into the locked state, then
 * unlock with the same master password. The reload only reaches the unlock form
 * if the vault envelope was restored from browser OPFS storage.
 */

import { chromium, type Page } from "playwright";

const baseUrl = process.env.ACCOUNTBOX_PROOF_URL ?? "http://localhost:3001";
const password = `bbx-phase2-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2)}-local`;

async function bodyText(page: Page) {
  return page
    .locator("body")
    .innerText({ timeout: 5_000 })
    .catch(() => "");
}

async function waitForWorkspace(page: Page, stage: string) {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return (
          !text.includes("Set a master password") &&
          !text.includes("Create your workspace") &&
          !text.includes("Save this recovery key") &&
          !text.includes("Unlock workspace") &&
          !text.includes("loading workspace")
        );
      },
      undefined,
      { timeout: 90_000 },
    );
  } catch (error) {
    throw new Error(`${stage} timed out:\n${await bodyText(page)}`, {
      cause: error,
    });
  }
  const text = await bodyText(page);
  if (
    /That password did not unlock|Passwords must match|Something went wrong/i.test(
      text,
    )
  ) {
    throw new Error(`${stage} failed:\n${text}`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const vaultApiRequests: string[] = [];
  await context.route("**/api/vault**", async (route) => {
    vaultApiRequests.push(route.request().url());
    await route.abort("failed");
  });

  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  if (!isolated) {
    throw new Error(
      "page is not cross-origin isolated; OPFS SQLite VFS cannot run",
    );
  }

  await page
    .getByRole("heading", {
      name: /Set a master password|Create your workspace/i,
    })
    .waitFor({ timeout: 30_000 });
  await page.getByPlaceholder("Master password").fill(password);
  await page.getByPlaceholder("Confirm").fill(password);
  await page.getByRole("button", { name: "Setup Secure Workspace" }).click();
  await waitForWorkspace(page, "create vault");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Unlock workspace" })
    .waitFor({ timeout: 90_000 });
  await page.getByPlaceholder("Master password").fill(password);
  await page.getByRole("button", { name: "Unlock" }).click();
  await waitForWorkspace(page, "unlock vault after reload");

  if (vaultApiRequests.length > 0) {
    throw new Error(
      `/api/vault was requested on the vault happy path:\n${vaultApiRequests.join(
        "\n",
      )}`,
    );
  }

  console.log("PASS (vault envelope OPFS reload/unlock proof)");
} finally {
  await browser.close();
}
