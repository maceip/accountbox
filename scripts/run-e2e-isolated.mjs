// Run a browser proof gate against its OWN dev server, not the shared :3000.
//
// The shared dev server has killed gates two documented ways (2026-07-05):
//   1. stale vite processes drop weight Range fetches mid-stream
//   2. HMR full-reloads (any concurrent edit to an SSR module) silently kill
//      a multi-GB weight stream — no error, the load just stalls
// This runner boots vite on an isolated port with E2E_NO_HMR=1 and
// BETTER_AUTH_URL matching the port (Better Auth 403s sign-up from any other
// origin), runs the test with E2E_URL pointed at it, then tears the server
// down. If E2E_URL is already set (e.g. a deployed target), the server boot
// is skipped and the test runs directly.
//
// Usage: node scripts/run-e2e-isolated.mjs test/run_grpo_e2e.mjs
//        E2E_PORT=3200 node scripts/run-e2e-isolated.mjs test/run_agents_e2e.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testFile = process.argv[2];
if (!testFile || !existsSync(testFile)) {
  console.error(`usage: node scripts/run-e2e-isolated.mjs <test-file>  (got: ${testFile})`);
  process.exit(2);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.E2E_PORT || 3100);
const BASE = `http://localhost:${PORT}`;

function runTest(baseUrl) {
  return new Promise((res) => {
    const t = spawn(process.execPath, [testFile], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, E2E_URL: baseUrl },
    });
    t.on("exit", (code) => res(code ?? 1));
  });
}

async function waitForServer(deadlineMs) {
  while (Date.now() < deadlineMs) {
    try {
      const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  if (process.env.E2E_URL) {
    console.log(`E2E_URL set (${process.env.E2E_URL}) — using it, no server boot`);
    process.exit(await runTest(process.env.E2E_URL));
  }

  const vite = join(repoRoot, "node_modules", ".bin", "vite");
  console.log(`booting isolated gate server on :${PORT} (E2E_NO_HMR=1)`);
  const server = spawn(vite, ["dev", "--port", String(PORT), "--strictPort"], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      E2E_NO_HMR: "1",
      BETTER_AUTH_URL: BASE,
      // Dev servers mount DialKit by default; its floating panel can sit over
      // gate selectors, so proof-gate servers run without it.
      VITE_DIALKIT: "off",
    },
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  const killServer = () => {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  process.on("SIGINT", () => {
    killServer();
    process.exit(130);
  });

  if (!(await waitForServer(Date.now() + 60_000))) {
    console.error(`gate server never came up on :${PORT}. last output:\n${serverLog.slice(-1500)}`);
    killServer();
    process.exit(1);
  }

  // The two historical breakers, checked up front so a bad server fails in
  // seconds instead of 20 minutes into a weight stream.
  const shard = await fetch(`${BASE}/model/model-00001-of-00002.safetensors`, {
    headers: { Range: "bytes=0-1023" },
  }).catch(() => null);
  if (shard?.status !== 206) {
    console.error(`preflight: weight Range fetch broken (status=${shard?.status}) — aborting`);
    killServer();
    process.exit(1);
  }
  console.log(`gate server ready at ${BASE} (Range 206 OK)`);

  const code = await runTest(BASE);
  killServer();
  process.exit(code);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
