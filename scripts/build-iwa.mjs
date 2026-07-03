/**
 * Package the client as a SIGNED WEB BUNDLE (.swbn) — the Isolated Web App
 * container format (GoogleChromeLabs webbundle tooling: wbn + wbn-sign).
 *
 * WHY (guardrail, not a shipping path yet): an IWA has NO origin server —
 * everything the app is must fit in this bundle, and all user data must live
 * client-side (OPFS/localStorage). Keeping this build green, alongside
 * test/server_footprint_check.mjs, mechanically enforces the local-first rule:
 * a new server-side dependency for core UI, or server-persisted user data,
 * breaks IWA parity visibly instead of silently.
 *
 * Usage:  bun run build && node scripts/build-iwa.mjs
 * Output: dist-iwa/accountbox.swbn (+ prints the Web Bundle ID / IWA origin)
 * Key:    dist-iwa/dev-key.pem — generated on first run, gitignored, DEV ONLY.
 *
 * Honest limitation, on purpose: the app is SSR (TanStack Start), so the
 * bundle carries the static client assets plus a placeholder entry document.
 * Client-only boot parity is the tracked next milestone; the server-footprint
 * test is the enforceable guardrail today.
 */
import { BundleBuilder } from "wbn";
import { IntegrityBlockSigner, NodeCryptoSigningStrategy, WebBundleId, parsePemKey } from "wbn-sign";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, ".output", "public");
const OUT_DIR = join(ROOT, "dist-iwa");
const KEY_PATH = join(OUT_DIR, "dev-key.pem");
const OUT = join(OUT_DIR, "accountbox.swbn");

if (!existsSync(PUB)) {
  console.error("no .output/public — run `bun run build` first");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

// dev signing key (ed25519), generated once — NEVER a production identity
if (!existsSync(KEY_PATH)) {
  const { privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }));
  console.log("generated DEV signing key:", relative(ROOT, KEY_PATH));
}
const key = parsePemKey(readFileSync(KEY_PATH, "utf8"));
const bundleId = new WebBundleId(key);

const MIME = new Map(Object.entries({
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".wasm": "application/wasm", ".mp4": "video/mp4",
}));
const mime = (p) => MIME.get(p.slice(p.lastIndexOf("."))) ?? "application/octet-stream";

const builder = new BundleBuilder("b2");
let count = 0;

function addDir(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { addDir(full); continue; }
    const rel = `/${relative(PUB, full).split("\\").join("/")}`;
    // Weights/adapters are runtime DATA (an IWA fetches them into OPFS), and
    // gate artifacts are transient — neither belongs in the app bundle.
    if (rel.startsWith("/model/") || rel.startsWith("/adapters/")) continue;
    if (rel === "/gate.html" || rel === "/gate.bundle.js") continue;
    builder.addExchange(rel, 200, { "Content-Type": mime(rel) }, readFileSync(full));
    count++;
  }
}
addDir(PUB);

builder.addExchange("/", 200, { "Content-Type": "text/html" },
  `<!doctype html><meta charset="utf-8"><title>AccountBox</title><link rel="manifest" href="/manifest.webmanifest"><body style="background:#111;color:#eee;font-family:monospace;padding:2rem">AccountBox IWA shell — static assets packaged (${count} files). Client-only boot parity is the tracked next milestone.`);

// IWA spec: the manifest MUST live at /.well-known/manifest.webmanifest and
// MUST carry a `version`. Derive it from the app manifest.
const baseManifest = JSON.parse(readFileSync(join(PUB, "manifest.webmanifest"), "utf8"));
builder.addExchange("/.well-known/manifest.webmanifest", 200,
  { "Content-Type": "application/manifest+json" },
  JSON.stringify({ ...baseManifest, version: "0.1.0" }, null, 2));

const unsigned = builder.createBundle();
const signer = new IntegrityBlockSigner(unsigned, bundleId.serialize(), [new NodeCryptoSigningStrategy(key)]);
const { signedWebBundle } = await signer.sign();
writeFileSync(OUT, signedWebBundle);

console.log(`wrote ${relative(ROOT, OUT)} — ${(signedWebBundle.length / 1024 / 1024).toFixed(1)} MB, ${count + 1} exchanges`);
console.log("web bundle id:", bundleId.serialize());
console.log("iwa origin:  ", bundleId.serializeWithIsolatedWebAppOrigin());
