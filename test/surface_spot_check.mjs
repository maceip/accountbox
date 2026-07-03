// SURFACE SPOT CHECK — boots the production build and walks the onboarding
// journey at three viewports (phone 390px, foldable ~840px unfolded, desktop
// 1280px), asserting the surface-specific UI actually renders:
//   phone:    generate-first vault CTA, full-screen connect prompt,
//             floating agent launcher -> full-screen sheet
//   desktop:  pitch panel beside the setup card, agent tile + connect tile
//             on the board, sidebar "Local agent" nav entry
// Screenshots land in /tmp/surface-*.png for eyeballing.
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchWebGpuBrowser } from "./lib/browser_launch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3993;
const PW = "surface-check-master-pw-01";

let ok = true;
function step(name, pass, detail = "") {
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

try { execSync(`rm -f /tmp/surface.db && cd ${ROOT} && DATABASE_URL=file:/tmp/surface.db bunx prisma db push --accept-data-loss >/dev/null 2>&1`); } catch {}
const srv = spawn("node", [join(ROOT, ".output/server/index.mjs")], {
  env: {
    ...process.env, PORT: String(PORT),
    DATABASE_URL: "file:/tmp/surface.db",
    BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
    BETTER_AUTH_SECRET: "surface-check-secret-0123456789abc",
  },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await launchWebGpuBrowser({ headless: false });
const BASE = `http://127.0.0.1:${PORT}`;

async function createVault(page) {
  await page.getByPlaceholder("Master password").fill(PW);
  await page.getByPlaceholder("Confirm").fill(PW);
  await page.getByRole("button", { name: "Setup Secure Workspace" }).click();
}

try {
  // ---------- desktop 1280x800 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    const pitch = await page.getByText("A local agent, not a cloud one.").isVisible();
    step("desktop: pitch panel beside setup card", pitch);
    await page.screenshot({ path: "/tmp/surface-desktop-gate.png" });
    await createVault(page);

    const chatInput = page.getByPlaceholder("e.g. Find all unread from manager this week...");
    await chatInput.waitFor({ timeout: 30_000 });
    step("desktop: agent tile open by default", true);
    const connect = await page.getByRole("button", { name: "Connect Gmail" }).isVisible();
    step("desktop: connect-Gmail tile on the board", connect);
    const navAgent = await page.getByText("Agent chat").isVisible();
    step("desktop: sidebar Local agent nav entry", navAgent);
    await page.screenshot({ path: "/tmp/surface-desktop-board.png" });
    await ctx.close();
  }

  // ---------- phone 390x844 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    const genBtn = page.getByRole("button", { name: "Generate a recovery key" });
    await genBtn.waitFor({ timeout: 15_000 });
    step("phone: generate-first CTA", true);
    const pitchHidden = !(await page.getByText("A local agent, not a cloud one.").isVisible().catch(() => false));
    step("phone: pitch panel hidden", pitchHidden);
    await page.screenshot({ path: "/tmp/surface-phone-gate.png" });

    // manual path still reachable
    await page.getByText("Set my own password instead").click();
    await page.getByPlaceholder("Master password").waitFor({ timeout: 5_000 });
    step("phone: manual password path reachable", true);
    await createVault(page);

    await page.getByRole("button", { name: "Connect Gmail" }).waitFor({ timeout: 30_000 });
    step("phone: full-screen connect prompt", true);
    await page.screenshot({ path: "/tmp/surface-phone-connect.png" });

    // floating launcher -> full-screen sheet
    await page.getByRole("button", { name: "Local agent" }).click();
    const sheetInput = page.getByPlaceholder("e.g. Find all unread from manager this week...");
    await sheetInput.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400); // let the open transition settle
    const box = await page.locator('[data-slot="sheet-content"]').boundingBox();
    step(
      "phone: agent opens as full-screen sheet",
      !!box && box.height >= 800 && box.width >= 380,
      box ? `${box.width}x${box.height}` : "no sheet box",
    );
    await page.screenshot({ path: "/tmp/surface-phone-agent.png" });
    await ctx.close();
  }

  // ---------- foldable-ish 840x800 (desktop board below md handled by width>=768) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 840, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder("Master password").waitFor({ timeout: 15_000 });
    await createVault(page);
    await page.getByPlaceholder("e.g. Find all unread from manager this week...").waitFor({ timeout: 30_000 });
    const connect = await page.getByRole("button", { name: "Connect Gmail" }).isVisible();
    step("foldable-width: board with connect tile + agent tile", connect);
    await page.screenshot({ path: "/tmp/surface-foldable-board.png" });
    await ctx.close();
  }
} catch (e) {
  step("spot check flow", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  srv.kill();
}

console.log(ok ? "\nSURFACE SPOT CHECK PASS" : "\nSURFACE SPOT CHECK FAIL");
process.exit(ok ? 0 : 1);
