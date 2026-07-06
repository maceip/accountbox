// Verifies workspace portability end to end against the production build:
//   context A ("browser 1"): create workspace -> journey gate -> seed journey
//     complete -> reload -> unlock -> Settings > Connections -> export file
//     (export lives in the logged-in Settings now; the locked screen shows no
//     export links by design)
//   context B ("browser 2", fresh profile): import file -> Unlock appears ->
//     same master password unlocks -> full shell (journey carried) -> SAME
//     identity pinned
// Same identity == same server user == Gmail connections follow the file.
// Journey progress must ride the workspace file too (accountbox:journey carry).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3996;
const PW = "portability-check-master-pw-1";

// Fresh DB BEFORE the server starts (it holds the sqlite file handle).
const { execSync } = await import("node:child_process");
try {
  execSync(
    `rm -f /tmp/portability-check.db && cd ${ROOT} && DATABASE_URL=file:/tmp/portability-check.db bunx prisma db push --accept-data-loss >/dev/null 2>&1`,
  );
} catch {}

const srv = spawn("node", [join(ROOT, ".output/server/index.mjs")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: "file:/tmp/portability-check.db",
    BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
    BETTER_AUTH_SECRET: "portability-check-secret-0123456789abcdef",
  },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await launchWebGpuBrowser({ headless: false });
try {
  // ---- browser 1: create vault ----
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto(`http://127.0.0.1:${PORT}/`);
  await a.getByPlaceholder("Master password").fill(PW);
  await a.getByPlaceholder("Confirm").fill(PW);
  await a.getByRole("button", { name: "Setup Secure Workspace" }).click();
  await Promise.race([
    // Fresh vault lands on the journey gate (the shell is earned, not given).
    a.locator('[data-journey-screen="overview"]').waitFor({ timeout: 30_000 }),
    a
      .locator("p.text-label-red")
      .first()
      .waitFor({ timeout: 30_000 })
      .then(async () => {
        throw new Error(
          `vault create error: ${await a.locator("p.text-label-red").first().textContent()}`,
        );
      }),
  ]);
  const identityA = await a.evaluate(() =>
    localStorage.getItem("bm.vault-identity"),
  );
  console.log(
    "browser 1: vault created, journey gate shown, identity =",
    identityA,
  );

  // Seed a completed journey so browser 1 can reach the full shell (Settings
  // holds the export now) and the carry assertion has state to ride the file.
  // (This check verifies the CARRY mechanism; earning the steps for real is
  // the deployed E2E's job — it streams the actual model.)
  const JOURNEY = JSON.stringify({
    v: 1,
    done: ["chat-agent", "first-skill", "connect-account"],
  });
  await a.evaluate((j) => localStorage.setItem("accountbox:journey", j), JOURNEY);

  // ---- browser 1: reload (locks memory) -> unlock -> Settings -> export ----
  await a.reload();
  await a.locator("#vault-unlock-password").fill(PW);
  await a.getByRole("button", { name: "Unlock workbench" }).click();
  await a.locator('[data-slot="sidebar"]').waitFor({ timeout: 30_000 });
  await a.getByRole("button", { name: "Local Workbench" }).click();
  await a.getByRole("menuitem", { name: "Settings" }).click();
  const dl = a.waitForEvent("download");
  await a.getByRole("button", { name: "Export workspace file" }).click();
  const file = await dl;
  const exportPath = "/tmp/accountbox-vault-export-check.json";
  await file.saveAs(exportPath);
  console.log("browser 1: exported workspace file from Settings");

  // ---- browser 2 (fresh profile): import -> unlock -> app shell ----
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(`http://127.0.0.1:${PORT}/`);
  await b.getByText("Set a master password").waitFor({ timeout: 15_000 });
  await b.setInputFiles('input[type="file"]', exportPath);
  await b
    .getByRole("button", { name: "Unlock workbench" })
    .waitFor({ timeout: 15_000 });
  console.log("browser 2: import accepted, Unlock form shown");
  await b.locator("#vault-unlock-password").fill(PW);
  await b.getByRole("button", { name: "Unlock workbench" }).click();
  // Journey completion carried -> straight to the full shell, no journey gate.
  await b.locator('[data-slot="sidebar"]').waitFor({ timeout: 30_000 });
  const journeyB = await b.evaluate(() =>
    localStorage.getItem("accountbox:journey"),
  );
  const identityB = await b.evaluate(() =>
    localStorage.getItem("bm.vault-identity"),
  );
  console.log(
    "browser 2: unlocked into full shell, journey =",
    journeyB,
    ", identity =",
    identityB,
  );

  const identityOk = identityA && identityA === identityB;
  const journeyOk = journeyB === JOURNEY;
  if (identityOk && journeyOk) {
    console.log(
      "identities match + journey progress carried — connections AND progression follow. PASS",
    );
  } else {
    console.error(
      `FAIL — identityA=${identityA} identityB=${identityB} journeyB=${journeyB}`,
    );
    process.exitCode = 1;
  }
} catch (e) {
  console.error("FAIL —", String(e).slice(0, 400));
  process.exitCode = 1;
} finally {
  await browser.close();
  srv.kill();
}
