// Verifies the signed web bundle ARTIFACT (dist-iwa/accountbox.swbn):
//   1. the integrity block parses and its bundle ID matches the dev key
//   2. the inner web bundle parses; required exchanges exist
//   3. the packaged app chunk is the real client build (not a stub)
//   4. weights/adapters are excluded (runtime data, not app)
//
// What this deliberately does NOT claim: a live isolated-app:// install.
// Chrome's IWA dev-mode install (--install-isolated-web-app-from-file) does
// not yet accept the bundle (SSR app -> placeholder entry; strict manifest
// requirements). That is the tracked client-only-boot milestone.
//
// Run: bun run build && node scripts/build-iwa.mjs && node test/iwa_bundle_check.mjs
import { Bundle } from "wbn";
import { getBundleId, WebBundleId, parsePemKey } from "wbn-sign";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const swbn = new Uint8Array(readFileSync(join(ROOT, "dist-iwa/accountbox.swbn")));

let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails++;
};

// 1. signature block parses; ID matches the signing key
const parsedId = getBundleId(swbn);
const expectedId = new WebBundleId(
  parsePemKey(readFileSync(join(ROOT, "dist-iwa/dev-key.pem"), "utf8")),
).serialize();
check("integrity block parses, bundle ID matches key", parsedId === expectedId, parsedId);

// 2. locate + parse the inner bundle ("🌐📦" magic preceded by CBOR bytes hdr)
const emoji = [0xf0, 0x9f, 0x8c, 0x90, 0xf0, 0x9f, 0x93, 0xa6];
let at = -1;
for (let i = 2; i < swbn.length - 8; i++) {
  if (emoji.every((b, j) => swbn[i + j] === b) && swbn[i - 1] === 0x48) { at = i - 2; break; }
}
check("inner web bundle located", at > 0, `offset ${at}`);
const bundle = new Bundle(Buffer.from(swbn.slice(at)));
const urls = bundle.urls;
check("exchange count sane", urls.length >= 40, `${urls.length} exchanges`);
for (const m of ["/", "/manifest.webmanifest", "/.well-known/manifest.webmanifest", "/icon-512.png", "/favicon.svg"]) {
  check(`contains ${m}`, urls.includes(m));
}

// 3. the app chunk is the real client build
const appChunk = urls.find((u) => u.startsWith("/assets/_app-"));
const chunkBody = appChunk ? Buffer.from(bundle.getResponse(appChunk).body).toString() : "";
check("real app code packaged", chunkBody.includes("Setup Secure Workspace"), appChunk);

// 4. runtime data excluded
check("weights/adapters excluded", !urls.some((u) => u.startsWith("/model/") || u.startsWith("/adapters/")));

// 5. well-known manifest carries the IWA-required version field
const wk = JSON.parse(Buffer.from(bundle.getResponse("/.well-known/manifest.webmanifest").body).toString());
check("well-known manifest has version", typeof wk.version === "string", wk.version);

console.log(fails === 0 ? "\nIWA BUNDLE: PASS" : `\nIWA BUNDLE: FAIL (${fails})`);
process.exitCode = fails === 0 ? 0 : 1;
