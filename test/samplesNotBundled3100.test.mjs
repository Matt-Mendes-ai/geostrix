// TASKS.csv #3100 — the four BC ARIS samples are not shipped: BC's copyright terms do not allow redistributing ARIS data without the
// Province's written permission. The installer keeps the synthetic sample, Blake River (OGL-Canada), WA uranium (CC BY 4.0) and
// Perk-Rocky's Copernicus terrain (redistributable with attribution). Checked with electron-builder's own file matcher on the real folder.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

// every file and folder under sample_data, walked the way electron-builder copies a FileSet (a folder is entered only if the filter lets it)
function shipped() {
  const set = pkg.build.extraResources.find((r) => r.from === "sample_data");
  const from = path.join(ROOT, "sample_data");
  const filter = new FileMatcher(from, set.to, (s) => s, set.filter).createFilter();
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name), st = statSync(full);
      if (!filter(full, st)) continue;
      if (st.isDirectory()) walk(full); else out.push(path.relative(from, full).replace(/\\/g, "/"));
    }
  };
  walk(from);
  return out;
}

test("the installer leaves out Harry, Woodjam, Silvertip and Perk-Rocky's ARIS files", () => {
  const files = shipped();
  for (const dir of ["harry_property/", "woodjam/", "silvertip/"]) assert.equal(files.filter((f) => f.startsWith(dir)).length, 0, dir);
  assert.deepEqual(files.filter((f) => f.startsWith("perk_rocky/")), ["perk_rocky/terrain_copernicus_glo30.tif"], "only the Copernicus terrain");
});

test("it keeps the synthetic sample, Blake River and WA uranium, whole", () => {
  const files = new Set(shipped());
  for (const f of ["README.md", "collars.csv", "survey.csv", "assay_wide.csv", "litho.csv"]) assert.ok(files.has(f), f);
  const all = (dir) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const f = path.join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(path.relative(path.join(ROOT, "sample_data"), f).replace(/\\/g, "/")); } }; walk(path.join(ROOT, "sample_data", dir)); return out; };
  for (const dir of ["blake_river", "wa_uranium", "synthetic_flat_grid"]) { const want = all(dir); assert.ok(want.length > 0, dir); for (const f of want) assert.ok(files.has(f), f); }
});
