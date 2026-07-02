import { defineConfig } from "vite";
import type { Plugin } from "vite";
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
function devApiImageDest(): Plugin {
  return {
    name: "betterbox:dev-api-image-dest",
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
    fs: {
      // Allow the external Emberglass WebGPU runtime (sibling project) so the
      // browser can dynamically import the real engine + kernels via /@fs/.
      // This is required to load the actual fine-tuned VibeThinker-3B + LoRA
      // instead of any proxy or target replay.
      allow: [process.cwd(), '/Users/mac/emberglass'],
    },
  },
  plugins: [
    devApiImageDest(),
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
});
