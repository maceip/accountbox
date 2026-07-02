// Verifies vault portability end to end against the production build:
//   context A ("browser 1"): create vault -> reload -> export vault file
//   context B ("browser 2", fresh profile): import file -> Unlock appears ->
//     same master password unlocks -> app shell -> SAME identity pinned
// Same identity == same server user == Gmail connections follow the vault.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3996;
const PW = "portability-check-master-pw-1";

// Fresh DB BEFORE the server starts (it holds the sqlite file handle).
const { execSync } = await import("node:child_process");
try { execSync(`rm -f /tmp/portability-check.db && cd ${ROOT} && DATABASE_URL=file:/tmp/portability-check.db bunx prisma db push --accept-data-loss >/dev/null 2>&1`); } catch {}

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
  await a.getByRole("button", { name: "Create vault & continue" }).click();
  await Promise.race([
    a.getByText("Local agent (VibeThinker-3B + Gmail LoRA)").waitFor({ timeout: 30_000 }),
    a.locator("p.text-label-red").first().waitFor({ timeout: 30_000 }).then(async () => {
      throw new Error("vault create error: " + (await a.locator("p.text-label-red").first().textContent()));
    }),
  ]);
  const identityA = await a.evaluate(() => localStorage.getItem("bm.vault-identity"));
  console.log("browser 1: vault created, identity =", identityA);

  // ---- browser 1: reload (locks memory) -> Unlock form -> export ----
  await a.reload();
  await a.getByRole("button", { name: "Unlock" }).waitFor({ timeout: 15_000 });
  const dl = a.waitForEvent("download");
  await a.getByText("Export vault file", { exact: false }).click();
  const file = await dl;
  const exportPath = "/tmp/accountbox-vault-export-check.json";
  await file.saveAs(exportPath);
  console.log("browser 1: exported vault file");

  // ---- browser 2 (fresh profile): import -> unlock -> app shell ----
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(`http://127.0.0.1:${PORT}/`);
  await b.getByText("Set a master password").waitFor({ timeout: 15_000 });
  await b.setInputFiles('input[type="file"]', exportPath);
  await b.getByRole("button", { name: "Unlock" }).waitFor({ timeout: 15_000 });
  console.log("browser 2: import accepted, Unlock form shown");
  await b.getByPlaceholder("Master password").fill(PW);
  await b.getByRole("button", { name: "Unlock" }).click();
  await b.getByText("Local agent (VibeThinker-3B + Gmail LoRA)").waitFor({ timeout: 30_000 });
  const identityB = await b.evaluate(() => localStorage.getItem("bm.vault-identity"));
  console.log("browser 2: unlocked, identity =", identityB);

  if (identityA && identityA === identityB) {
    console.log("identities match — same server user, connections follow. PASS");
  } else {
    console.error(`FAIL — identityA=${identityA} identityB=${identityB}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error("FAIL —", String(e).slice(0, 400));
  process.exitCode = 1;
} finally {
  await browser.close();
  srv.kill();
}
