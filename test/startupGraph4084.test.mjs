// TASKS.csv #4084 — the pin that keeps the startup gain, beside the budget (scripts/check-bundle-size.mjs, which needs a build): the STATIC import graph from src/main.jsx (what the startup bundle holds; a dynamic
// import() is a chunk of its own) must not reach lib/reproject.js or proj4 / wkt-parser / mgrs. An eager module that wants a definition-only lookup (crsName, isMetricProjectedEpsg, getProj4DefSync ...)
// imports lib/crsDefs.js; one that needs the maths asks lib/reprojectLazy.js. Any static import of reproject.js from startup code puts ~131 kB back and fails here, naming the importer.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// import "x?url" / "?worker" are Vite's; for a graph walk they are empty modules
const stubQuery = { name: "stub-query", setup(b) { b.onResolve({ filter: /\?(url|worker|raw|inline)/ }, (a) => ({ path: a.path, namespace: "stub" })); b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default ''", loader: "js" })); } };

test("#4084 the startup import graph has no static path to reproject.js or proj4", { timeout: 120000 }, async () => {
  const r = await build({
    entryPoints: ["src/main.jsx"], bundle: true, splitting: true, format: "esm", minify: false, metafile: true, write: false, outdir: "out", logLevel: "silent",
    loader: { ".jsx": "jsx", ".png": "dataurl", ".svg": "dataurl", ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl", ".wasm": "empty", ".css": "empty" },
    define: { __GEOSTRIX_FEATURES__: '{"mineDesign":false}' }, external: ["electron"], plugins: [stubQuery],
  });
  const inputs = r.metafile.inputs;
  const edges = (m) => (inputs[m]?.imports || []).filter((i) => i.kind === "import-statement" || i.kind === "require-call").map((i) => i.path);
  const seen = new Map([["src/main.jsx", null]]), q = ["src/main.jsx"];
  while (q.length) { const m = q.shift(); for (const p of edges(m)) if (inputs[p] && !seen.has(p)) { seen.set(p, m); q.push(p); } }
  const chain = (m) => { const c = []; for (let x = m; x; x = seen.get(x)) c.unshift(x); return c.join(" -> "); };
  const bad = [...seen.keys()].filter((m) => /(^|\/)src\/lib\/reproject\.js$/.test(m) || /node_modules\/(proj4|wkt-parser|mgrs)\//.test(m));
  assert.deepEqual(bad.map(chain), [], "startup code must not import lib/reproject.js (use lib/crsDefs.js for the definitions, lib/reprojectLazy.js for the maths)");
  // the other half: what startup does import is there (the walk is not empty)
  assert.ok(seen.has("src/lib/crsDefs.js") && seen.has("src/lib/reprojectLazy.js") && seen.size > 300, `the walk reached ${seen.size} modules`);
});
