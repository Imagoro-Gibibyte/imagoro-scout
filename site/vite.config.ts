import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BUILD_ID = String(Date.now());
/**
 * One static build serves the whole site: the pages and the web terminal.
 * Deep links are handled by `public/_redirects` (`/* /index.html 200`), so the
 * same build works on any static host that honours it.
 *
 * No deployed hostname is baked in here. The terminal reads
 * `VITE_AGENT_URL` / `VITE_GATEWAY_URL` at build time and falls back to a
 * loopback agent plus the in-browser demo shell, so a plain build is a
 * self-contained demo.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: "emit-version",
      buildStart() {
        writeFileSync(resolve("public", "version.json"), JSON.stringify({ buildId: BUILD_ID }));
      }
    }
  ],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  server: {
    port: 8794,
    strictPort: true
  },
  build: {
    target: "es2022",
    sourcemap: true
  }
});
