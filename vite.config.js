import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";

// TASKS.csv #347 — Content-Security-Policy for the packaged renderer. Build-only: the dev server needs
// Vite's inline React-refresh preamble and its HMR websocket, which a strict policy would block, and the
// dev renderer is never shipped. Inline scripts left in the final HTML (the splash) are allowed by
// sha256 hash, computed here from the exact bytes that ship, so editing the splash can't silently break it.
//   script-src  'wasm-unsafe-eval' — sql.js compiles its WebAssembly (GeoPackage / SQL workspace). No
//               'unsafe-eval': the field calculator no longer uses new Function (#344).
//   style-src   'unsafe-inline' — the UI is built from React style={{}} attributes.
//   connect-src the local Python sidecar and the three basemap tile hosts (tileCache.js fetches tiles
//               into IndexedDB); WMS/WFS and SRTM go through the main process (IPC), not the renderer.
//   img-src     data:/blob: for cached tiles, drapes and exports.
const TILE_HOSTS = "https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://tile.tracestrack.com https://tiles.maps.eox.at";
function cspPlugin() {
  return {
    name: "geostrix-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
        const csp = [
          "default-src 'self'",
          `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")}`,
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: blob: ${TILE_HOSTS}`,
          "font-src 'self' data:",
          `connect-src 'self' data: blob: http://127.0.0.1:8765 ${TILE_HOSTS}`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'none'",
        ].join("; ");
        return html.replace("<head>", `<head>
    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: "./",
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // TASKS.csv #35 — the app was shipping as one ~1MB JS chunk, which triggers Vite/Rollup's
    // "chunks larger than 500 kB after minification" warning and means the browser can't cache
    // vendor code separately from app code (every feature commit invalidated the whole bundle).
    // Split heavy, slow-changing third-party deps into their own vendor chunks so they cache
    // independently of app code, and split three.js out on its own since it dominates bundle
    // size and is only exercised by the 3D viewer module (not geochem/geophysics/layout).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // TASKS.csv #439 — Vite's dynamic-import preload helper is shared by every lazy import; left to
          // Rollup it landed in vendor-geotiff, so the startup chunk imported geotiff just to get it.
          // vendor-react always loads at startup anyway.
          if (id.includes("vite/preload-helper")) return "vendor-react";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three")) return "vendor-three";
          if (/geotiff[\/]dist-[a-z]+[\/]compression[\/]/.test(id)) return undefined; // #439 — per-codec, loaded on demand
          if (id.includes("geotiff")) return "vendor-geotiff";
          if (id.includes("papaparse")) return "vendor-papaparse";
          if (id.includes("lucide-react")) return "vendor-lucide";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react";
          // TASKS.csv #439 — packages that only lazily-loaded code uses must NOT be forced into the eager
          // catch-all vendor chunk, or they load at startup anyway: GeoTIFF's compression decoders (zstd
          // 154 KB, LERC, deflate — loaded by geotiff on demand, only for TIFFs that need them) and sql.js
          // (GeoPackage / SQL workspace). Returning undefined lets Rollup place them with their importers.
          if (/node_modules[\/](zstddec|lerc|pako|sql\.js|xml-utils|web-worker|@petamoriken)[\/]/.test(id)) return undefined;
          return "vendor";
        },
      },
    },
  },
});
