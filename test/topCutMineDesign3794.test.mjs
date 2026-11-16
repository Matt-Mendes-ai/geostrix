// TASKS.csv #3794 (Scottie Gold review, Mine Design) — no result said the block model was top-cut at 30 g/t (24.4 % of the metal removed), and Stope outlines and a solid dropped the
// support shares the pit prints. The note reads side 2's lib/topCutNote.js (#3783). Synthetic model and parameters.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";
import { topCutText } from "../src/lib/topCutText.js";
import { topCutCells, topCutRecord } from "../src/lib/topCutCells.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const params = (extra = {}) => ({ element: "Au", unit: "ppm", tool: "idw2", capValue: 30, capAudit: { nCapped: 11, nSamples: 3778, pctMetalRemoved: 24.37 }, ...extra });

test("the note: capped, how many samples, how much metal; uncapped; nothing for an imported model", () => {
  const c = topCutText(params());
  assert.equal(c.text, "Grades top-cut at 30 g/t before estimating (11 of 3778 samples cut, 24.4 % of the metal removed).");
  assert.equal(c.heavy, true, "24 % of the metal is a heavy cut");
  assert.equal(topCutText(params({ capValue: null })).text, "Grades not top-cut: the highest samples entered the estimate at full grade.");
  assert.equal(topCutText({ name: "imported" }), null);
  assert.equal(topCutText(null), null);
  assert.equal(topCutText(params({ capAudit: null })).text, "Grades top-cut at 30 g/t before estimating.", "a cap with no audit: the cap alone");
});

test("the CSV cells and the params record", () => {
  assert.deepEqual(topCutCells(params()), { top_cut: 30, top_cut_samples_cut: 11, top_cut_samples: 3778, top_cut_pct_metal_removed: 24.4 });
  assert.deepEqual(topCutCells(params({ capValue: 0 })), { top_cut: "none" });
  assert.deepEqual(topCutCells({}), {});
  assert.deepEqual(topCutRecord(params()), { kind: "capped", cap: 30, nCapped: 11, nSamples: 3778, pctMetalRemoved: 24.37 });
  assert.deepEqual(topCutRecord(params({ capValue: null })), { kind: "uncapped" });
  assert.equal(topCutRecord({}), null);
});

// 6 x 6 columns of 5 m blocks, one 10 m level: a 3 x 3 patch at 8 g/t, of which the centre column is one-hole, three are extrapolated, two lie beyond the samples
const cells = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
  const ore = i >= 1 && i <= 3 && j >= 1 && j <= 3, c = { x: i * 5, y: j * 5, z: 5, dx: 5, dy: 5, dz: 10, value: ore ? 8 : 0.5 };
  if (i === 2 && j === 2) c.nHoles = 1;
  if (ore && (i === 1 && j <= 3)) c.support = "extrapolated";
  if (i === 3 && j === 1) c.beyond = "above"; if (i === 3 && j === 2) c.beyond = "below";
  cells.push(c);
}
test("the stope run gives the shares of the material above the cut-off: one hole, extrapolated, beyond the samples", () => {
  const r = stopeOutlines({ cells }, { cutoff: 3, levelH: 10, density: 2, minWidth: 0 });
  const ore = r.totals.oreTonnes, colT = 25 * 10 * 2;
  assert.ok(Math.abs(ore - 9 * colT) < 1e-6, `${ore}`);
  assert.ok(Math.abs(r.totals.thinT - 1 * colT) < 1e-6, "one hole: 1 column");
  assert.ok(Math.abs(r.totals.extrapT - 3 * colT) < 1e-6, "extrapolated: 3 columns (i = 1)");
  assert.ok(Math.abs(r.totals.beyondT - 2 * colT) < 1e-6, "beyond: 2 columns");
  const s = r.levels.find((l) => l.stopes.length).stopes[0];
  assert.equal(s.thinT, 1 * colT); assert.equal(s.extrapT, 3 * colT); assert.equal(s.beyondT, 2 * colT);
});

test("wiring: every Mine Design pane and the string solid say the cut; the stope CSV and the solids' params carry it", () => {
  for (const f of ["StopesPane", "PitShellPane", "PitDesignPane", "NestedPitsPane"]) assert.match(read(`../src/components/${f}.jsx`), /<TopCutNote model=\{/, f);
  assert.match(read("../src/components/DesignStringsPane.jsx"), /const cut = topCutText\(model\?\.params\);/);
  const s = read("../src/components/StopesPane.jsx");
  assert.match(s, /\.\.\.\(res\.topCutCells \|\| \{\}\) \/\* #3794 \*\//);
  assert.match(s, /topCut: res\.topCut \|\| null \/\* #3794 \*\//);
  assert.match(s, /Above cut-off: one hole \/ extrapolated \/ beyond the samples/);
  assert.match(read("../src/components/PitShellPane.jsx"), /topCut: topCutRecord\(model\.params\) \/\* #3794 \*\//);
  assert.match(read("../src/components/NestedPitsPane.jsx"), /\.\.\.topCutCells\(model\?\.params\) \/\* #3794 \*\//);
  assert.match(read("../src/components/PitDesignPane.jsx"), /\.\.\.topCutCells\(model\?\.params\) \/\* #3794 \*\//);
});
