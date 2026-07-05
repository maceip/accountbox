import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Dev-only fix for email images. The reader loads proxied images as <img>
 * (`/api/image-proxy` and inline `/api/message` attachments), so the browser
 * sends `Sec-Fetch-Dest: image`. In the Vite dev server that routes the request
 * to the static-asset pipeline, which 404s and bypasses the server route — the
 * images then fall back to alt text. Production (Nitro) routes by path and is
 * unaffected. Normalizing the header on `/api/` requests lets them reach the
 * handler in dev. The proxy's SSRF and cross-site guards are untouched.
 */
/**
 * Dev-only: serve model weights at /model (skill base) and /model-chat (chat
 * model) with Range support. The weights live outside public/ (nitro cannot
 * ingest >2GiB assets at build time); in production Caddy serves both mounts
 * statically, this middleware keeps `bun run dev` working.
 */
function devModelServer(): Plugin {
  const MOUNTS = ["/model", "/model-chat"] as const;
  return {
    name: "accountbox:dev-model-server",
    apply: "serve",
    configureServer(server) {
      const root = dirname(fileURLToPath(import.meta.url));
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        // Longest prefix first so /model-chat/ never matches the /model mount.
        const mount = [...MOUNTS]
          .sort((a, b) => b.length - a.length)
          .find((m) => url.startsWith(`${m}/`));
        if (!mount) return next();
        const modelDir = join(root, mount.slice(1));
        const file = join(modelDir, normalize(url.slice(mount.length + 1)));
        if (!file.startsWith(modelDir) || !existsSync(file)) return next();
        const { size } = statSync(file);
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
        if (range) {
          const start =
            range[1] === ""
              ? Math.max(0, size - Number(range[2] || 0))
              : Number(range[1]);
          const end =
            range[2] === "" || range[1] === ""
              ? size - 1
              : Math.min(size - 1, Number(range[2]));
          res.writeHead(206, {
            "content-type": "application/octet-stream",
            "content-range": `bytes ${start}-${end}/${size}`,
            "content-length": end - start + 1,
            "accept-ranges": "bytes",
          });
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            "content-type": "application/octet-stream",
            "content-length": size,
            "accept-ranges": "bytes",
          });
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

function devApiImageDest(): Plugin {
  return {
    name: "accountbox:dev-api-image-dest",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (
          req.url?.startsWith("/api/") &&
          req.headers["sec-fetch-dest"] === "image"
        ) {
          req.headers["sec-fetch-dest"] = "empty";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Bind all interfaces and accept tunnel Host headers so the app is reachable
  // over LAN and via an https tunnel (cloudflared *.trycloudflare.com), which is
  // required for WebGPU to run off-machine (WebGPU needs a secure context).
  server: {
    host: true,
    allowedHosts: true,
    // The WebGPU engine is vendored in-repo at src/engine/, so no external
    // fs.allow entries are needed — the repo is self-contained.
    // E2E_NO_HMR: proof-gate runs stream multi-GB weights for minutes; an HMR
    // full-reload (any concurrent edit to an SSR module) kills the load
    // mid-stream. E2E servers opt out of the reload channel entirely.
    hmr: process.env.E2E_NO_HMR ? false : undefined,
  },
  plugins: [
    devModelServer(),
    devApiImageDest(),
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
});
