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

// every file under electron/ (subfolders too), the preload and the worker_threads entries included
const electronFiles = (dir = new URL("../electron/", import.meta.url)) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? electronFiles(new URL(`${e.name}/`, dir)) : /\.[cm]?js$/.test(e.name) ? [new URL(e.name, dir)] : []);

test("everything the main process, the preload and the workers require or import is a runtime dependency", () => {
  const need = new Set(), files = electronFiles();
  assert.ok(files.some((u) => /sampleWorker\.js$/.test(u.pathname)) && files.some((u) => /preload\.js$/.test(u.pathname)), "the worker entry and the preload are scanned");
  for (const u of files) {
    const src = fs.readFileSync(u, "utf8");
    // require("x"), import("x"), import ... from "x", import "x"
    for (const m of src.matchAll(/(?:require\(\s*|import\(\s*|from\s+|^\s*import\s+)["']([^"'./][^"']*)["']/gm)) {
      const spec = m[1];
      if (spec.startsWith("node:") || spec === "electron" || builtinModules.includes(spec.split("/")[0])) continue; // built-ins (node:sqlite too) and Electron itself
      need.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    }
  }
  assert.ok(need.size >= 4, `found the main process's packages: ${[...need]}`);
  for (const n of need) assert.ok(n in pkg.dependencies, `electron/ requires ${n}: it must be in dependencies`);
});

test("a worker_threads entry is a file under electron/ (so the scan above sees it)", () => {
  for (const u of electronFiles()) {
    for (const m of fs.readFileSync(u, "utf8").matchAll(/new Worker\(\s*path\.join\(__dirname,\s*["']([^"']+)["']/g)) {
      assert.ok(fs.existsSync(new URL(`./${m[1]}`, u)), `${m[1]} sits beside ${u.pathname.split("/").pop()}`);
    }
  }
});

test("the installer keeps the app's five languages only", () => {
  assert.deepEqual(pkg.build.electronLanguages, ["en-US", "es", "es-419", "pt-BR", "pt-PT", "fr", "ar"]);
});
