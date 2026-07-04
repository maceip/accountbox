#!/usr/bin/env node
import { chromium } from "playwright";

const target =
  process.env.ACCOUNTBOX_SMOKE_URL ?? "https://train.public.computer/?dialkit=1";
const errors = [];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.stack || error.message);
  });

  const response = await page.goto(target, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  if (!response?.ok()) {
    throw new Error(
      `HTTP ${response?.status() ?? "no response"} loading ${target}`,
    );
  }

  await page.waitForTimeout(3_000);

  const body = await page.locator("body").innerText({ timeout: 10_000 });
  const fatalText = /Something went wrong|Show Error|Minified React error/i;
  if (fatalText.test(body)) {
    throw new Error(`train-dev rendered error boundary:\n${body.slice(0, 1000)}`);
  }

  const hasDialKitUi =
    /Agent notes|Tag element|Copy for agent/i.test(body) ||
    (await page.locator(".dialkit-root, [class*='dialkit']").count()) > 0;

  if (!hasDialKitUi) {
    throw new Error(
      "DialKit UI did not render on train-dev smoke page. Open with ?dialkit=1 and verify panel mounts.",
    );
  }

  const html = await page.content();
  const scriptPaths = [
    ...new Set(
      [...html.matchAll(/\/assets\/[^"']+\.js/g)].map((match) => match[0]),
    ),
  ];
  if (scriptPaths.length === 0) {
    throw new Error("No JS assets found in train-dev smoke page HTML.");
  }

  const bundles = await Promise.all(
    scriptPaths.map(async (path) => {
      const bundleUrl = new URL(path, target).href;
      const response = await fetch(bundleUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${bundleUrl}: HTTP ${response.status}`);
      }
      return response.text();
    }),
  );
  const combined = bundles.join("\n");
  if (!/accountbox-train|copyAgentReport/.test(combined)) {
    throw new Error("DialKit bundle markers missing from shipped JS assets.");
  }

  console.log(`PASS train-dev smoke: ${target} (DialKit UI rendered)`);
} finally {
  await browser.close();
}
