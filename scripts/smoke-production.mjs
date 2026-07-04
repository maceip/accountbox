#!/usr/bin/env node
import { chromium } from "playwright";

const target =
  process.env.ACCOUNTBOX_SMOKE_URL ?? "https://train.public.computer/";
const errors = [];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844, isMobile: true },
  });

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.stack || error.message);
  });
  page.on("requestfailed", (request) => {
    errors.push(
      `request failed: ${request.url()} ${request.failure()?.errorText ?? ""}`,
    );
  });

  const response = await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response?.ok()) {
    throw new Error(
      `HTTP ${response?.status() ?? "no response"} loading ${target}`,
    );
  }

  await page.waitForTimeout(5_000);
  const body = await page.locator("body").innerText({ timeout: 10_000 });
  const fatalText = /Something went wrong|Show Error|Minified React error/i;
  if (fatalText.test(body)) {
    throw new Error(
      `production rendered error boundary:\n${body.slice(0, 1000)}`,
    );
  }
  const fatalConsole = errors.filter((entry) =>
    /Minified React error|Maximum update depth|Hydration failed|Something went wrong/i.test(
      entry,
    ),
  );
  if (fatalConsole.length > 0) {
    throw new Error(`production console errors:\n${fatalConsole.join("\n\n")}`);
  }

  console.log(`PASS production smoke: ${target}`);
} finally {
  await browser.close();
}
