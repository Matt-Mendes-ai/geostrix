// TASKS.csv #3100 — the four BC ARIS samples are not shipped: BC's copyright terms do not allow redistributing ARIS data without the
// Province's written permission. The sample_data filter is a DENYLIST (Main, 2026-11-12): every other sample — the synthetic one, Blake
// River, WA uranium, #3107's five and any added later — ships whole; Perk-Rocky's Copernicus terrain (redistributable with attribution)
// ships through its own entry. Checked with electron-builder's own file matcher on the real folder.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SD = path.join(ROOT, "sample_data");
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const BC = ["harry_property", "woodjam", "silvertip", "perk_rocky"];
const rel = (f) => path.relative(SD, f).replace(/\\/g, "/");
const walkAll = (dir) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const f = path.join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(rel(f)); } }; walk(dir); return out; };

// every file the sample_data FileSet copies, walked the way electron-builder does (a folder is entered only if the filter lets it)
function shipped() {
  const set = pkg.build.extraResources.find((r) => r.from === "sample_data");
  const filter = new FileMatcher(SD, set.to, (s) => s, set.filter).createFilter();
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name), st = statSync(full);
      if (!filter(full, st)) continue;
      if (st.isDirectory()) walk(full); else out.push(rel(full));
    }
  };
  walk(SD);
  return out;
}

test("the installer leaves out Harry, Woodjam, Silvertip and Perk-Rocky", () => {
  const files = shipped();
  for (const dir of BC) assert.equal(files.filter((f) => f.startsWith(`${dir}/`)).length, 0, dir);
});

test("every other sample is shipped whole — the synthetic one, Blake River, WA uranium, the #3107 samples and any added later", () => {
  const files = new Set(shipped());
  const others = readdirSync(SD).filter((n) => statSync(path.join(SD, n)).isDirectory() && !BC.includes(n));
  assert.ok(others.length >= 3, others.join(", ")); // no fixed list: every folder that is not one of the four BC samples (#3107's and any later)
  for (const dir of others) { const all = walkAll(path.join(SD, dir)); assert.ok(all.length > 0, dir); for (const f of all) assert.ok(files.has(f), f); }
  for (const f of readdirSync(SD).filter((n) => statSync(path.join(SD, n)).isFile())) assert.ok(files.has(f), f); // the synthetic sample's CSVs and README
});

test("Perk-Rocky's Copernicus terrain is shipped on its own, where the sample reads it", () => {
  const e = pkg.build.extraResources.find((r) => r.from === "sample_data/perk_rocky/terrain_copernicus_glo30.tif");
  assert.ok(e, "its own entry");
  assert.equal(e.to, "sample_data/perk_rocky/terrain_copernicus_glo30.tif");
  assert.equal(e.filter, undefined, "a single file");
  assert.ok(existsSync(path.join(ROOT, e.from)));
  // electron-builder reads a file mapping as the one file (no patterns): the matcher matches that file only
  const m = new FileMatcher(path.join(ROOT, e.from), e.to, (s) => s, e.filter);
  assert.equal(m.isEmpty(), true);
});
