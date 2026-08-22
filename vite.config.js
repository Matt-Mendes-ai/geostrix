import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three")) return "vendor-three";
          if (id.includes("geotiff")) return "vendor-geotiff";
          if (id.includes("papaparse")) return "vendor-papaparse";
          if (id.includes("lucide-react")) return "vendor-lucide";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
});
