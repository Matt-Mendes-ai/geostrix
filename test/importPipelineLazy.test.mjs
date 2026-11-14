// Startup split (side 3, 2026-11-13, Main's request: startup JavaScript at 1,976 kB of a 2,000 kB budget) — the 3D View's import pipeline body
// (72 kB of startup) loads on first use. This pins the boundary: nothing eager imports the body statically.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
const hook = rd("../src/modules/viewer/useImportPipeline.js"), impl = rd("../src/modules/viewer/importPipelineImpl.js");

test("the hook loads the body dynamically and imports only what a hook needs", () => {
  assert.match(hook, /import\("\.\/importPipelineImpl\.js"\)/);
  const statics = [...hook.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(statics, ["react", "../../lib/menuRequests.js", "../../lib/store.jsx", "../../lib/notices.js", "../../lib/viewer/layerOverlap.js"]);
  assert.ok(hook.split("\n").length < 80, "the hook stays small: new import code goes in importPipelineImpl.js");
});

test("no source file imports the body statically", () => {
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(e.name) && !p.endsWith("importPipelineImpl.js") && /^import [^(]*from "[^"]*importPipelineImpl\.js"/m.test(fs.readFileSync(p, "utf8"))) hits.push(p); } };
  walk(path.resolve("src"));
  assert.deepEqual(hits, []);
});

test("the hook returns what the body returns, and keeps the React state", () => {
  const names = (s) => s.match(/return \{ ([^}]+) \};\s*\}\s*$/)[1].split(",").map((x) => x.trim().split(":")[0].trim()).sort();
  assert.deepEqual(names(hook), names(impl));
  for (const h of ["useStore()", "useState(null)", "useRef(null)", "useRef(false)", "useModuleAction([\"import-dropped-files\"]", "useCallback("]) assert.ok(hook.includes(h), h);
  for (const h of ["useStore(", "useState(", "useRef(", "useCallback(", "useModuleAction("]) assert.ok(!impl.includes(h), `no hook call in the body: ${h}`);
  assert.match(impl, /export function makeImportPipeline\(ctx, h\) \{/);
  // a drop's files are taken while the event lasts
  assert.match(hook, /const handleDrop = \(e\) => \{ e\.preventDefault\(\); setDragOver\(false\); const files = Array\.from\(e\.dataTransfer\?\.files \|\| \[\]\);/);
});
