// LOCAL-FIRST GUARDRAIL — the enforceable half of IWA parity.
//
// Boots the real production build in real Chrome, walks the first-run flow
// (landing -> vault create -> app shell), records EVERY /api/* request the
// client makes, and fails if any endpoint outside the ALLOWLIST is touched.
//
// The allowlist is the app's entire licensed server footprint for core boot:
//   /api/auth/*     Better Auth session anchor (vault-derived; by design)
//   /api/accounts   Gmail connection metadata listing (empty until connected)
// Anything else appearing here means someone added a server dependency for
// core UI or started moving user data server-side — exactly what IWA
// deployment would forbid. Fail loudly, fix consciously.
//
// Also asserts the positive side: the vault envelope must actually land in
// OPFS (browser storage), not on the server.
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3992;
const PW = "footprint-check-master-pw-1";

const ALLOWLIST = [/^\/api\/auth\//, /^\/api\/accounts$/];

try { execSync(`rm -f /tmp/footprint.db && cd ${ROOT} && DATABASE_URL=file:/tmp/footprint.db bunx prisma db push --accept-data-loss >/dev/null 2>&1`); } catch {}
const srv = spawn("node", [join(ROOT, ".output/server/index.mjs")], {
  env: {
    ...process.env, PORT: String(PORT),
    DATABASE_URL: "file:/tmp/footprint.db",
    BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
    BETTER_AUTH_SECRET: "footprint-check-secret-0123456789ab",
  },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await launchWebGpuBrowser({ headless: false });
try {
  const page = await (await browser.newContext()).newPage();
  const apiCalls = new Set();
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith("/api/")) apiCalls.add(u.pathname);
  });

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByPlaceholder("Master password").fill(PW);
  await page.getByPlaceholder("Confirm").fill(PW);
  await page.getByRole("button", { name: "Setup Secure Workspace" }).click();
  await page.getByText("Local agent (VibeThinker-3B + Gmail LoRA)").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500); // let the shell settle (queries fire)

  // positive assertion: the encrypted envelope is in OPFS, in the browser
  // (src/lib/db/opfs.ts stores product records in betterbox-product/store.json)
  const opfsHasVault = await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("betterbox-product");
      const fh = await dir.getFileHandle("store.json");
      const text = await (await fh.getFile()).text();
      return text.includes("ciphertext");
    } catch {
      return false;
    }
  });

  const calls = [...apiCalls].sort();
  const violations = calls.filter((p) => !ALLOWLIST.some((re) => re.test(p)));

  console.log("server endpoints touched during first-run boot:");
  for (const c of calls) console.log(`  ${violations.includes(c) ? "VIOLATION" : "allowed  "} ${c}`);
  console.log("vault envelope present in OPFS:", opfsHasVault);

  if (violations.length === 0 && opfsHasVault) {
    console.log("SERVER FOOTPRINT: PASS — core boot touches only the session anchor; user data is browser-local");
  } else {
    console.error("SERVER FOOTPRINT: FAIL");
    process.exitCode = 1;
  }
} catch (e) {
  console.error("FAIL —", String(e).slice(0, 300));
  process.exitCode = 1;
} finally {
  await browser.close();
  srv.kill();
}
