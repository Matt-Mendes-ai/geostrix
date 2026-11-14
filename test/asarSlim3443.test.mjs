// TASKS.csv #3443 — the installer's app.asar carries only what the main process loads: the renderer-only libraries Vite bundles into dist/ are
// devDependencies (but still audited and on the licence page through BUNDLED_FROM_DEV), the languages are the app's own, and every bare
// require() in electron/ is a runtime dependency (so a main-process import of a dev-only package fails here, not in an installed app).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { builtinModules } from "node:module";
import { BUNDLED_FROM_DEV } from "../scripts/shipped-roots.mjs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pkg = JSON.parse(read("../package.json"));
const RENDERER_ONLY = ["@fontsource/exo-2", "d3-delaunay", "geotiff", "h5wasm", "laz-perf", "lucide-react", "meshoptimizer", "proj4", "sql.js", "three"];

test("the renderer-only packages are devDependencies, and still audited and licensed as shipped", () => {
  for (const n of RENDERER_ONLY) {
    assert.ok(!(n in pkg.dependencies), `${n} is not a runtime dependency (electron-builder would pack it into app.asar)`);
    assert.ok(n in pkg.devDependencies, `${n} stays installed for Vite`);
    assert.ok(BUNDLED_FROM_DEV.includes(n), `${n} is in the shipped list the audit and the licence page read`);
  }
});

test("everything the main process requires is a runtime dependency", () => {
  const need = new Set();
  for (const f of fs.readdirSync(new URL("../electron/", import.meta.url)).filter((x) => /\.c?js$/.test(x))) {
    for (const m of read(`../electron/${f}`).matchAll(/require\(\s*["']([^"'./][^"']*)["']\s*\)/g)) {
      const spec = m[1];
      if (spec.startsWith("node:") || spec === "electron" || builtinModules.includes(spec.split("/")[0])) continue; // built-ins (node:sqlite too) and Electron itself
      need.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    }
  }
  assert.ok(need.size >= 4, `found the main process's packages: ${[...need]}`);
  for (const n of need) assert.ok(n in pkg.dependencies, `electron/ requires ${n}: it must be in dependencies`);
});

test("the installer keeps the app's five languages only", () => {
  assert.deepEqual(pkg.build.electronLanguages, ["en-US", "es", "es-419", "pt-BR", "pt-PT", "fr", "ar"]);
});
