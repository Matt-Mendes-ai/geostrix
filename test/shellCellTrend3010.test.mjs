// TASKS.csv #3010 (WA iron review) — the grade shell's real cell under a trend: Cell 10 at 10:10:1 is about 21.5 x 21.5 x 2.2 m, said in the
// pane, the record and the surface's label
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trendCellM, trendCellText } from "../src/lib/trendCell.js";
import { surfaceOptionLabels } from "../src/lib/viewer/surfaceLabels.js";

test("Cell 10 under a 10:10:1 trend: about 21.5 x 21.5 x 2.2 m (the review's grid: 620 x 920 x 150 m in 32 x 46 x 50 cells)", () => {
  const c = trendCellM({ name: "T", dip: 0, dipAzimuth: 0, pitch: 0, ratios: { max: 10, int: 10, min: 1 } }, 10);
  assert.equal(trendCellText(c), "21.5 × 21.5 × 2.2");
  assert.ok(Math.abs(c[0] * c[1] * c[2] - 1000) < 1e-6, "the warp keeps volume: the cell's volume is 10 m cubed");
  assert.equal(trendCellM(null, 10), null);
});

test("two shells of one name told apart by their cells along the trend", () => {
  const m = surfaceOptionLabels([{ id: "a", name: "Fe 55", params: { cellSizeM: 10, cellAlongTrendM: [21.5, 21.5, 2.2] } }, { id: "b", name: "Fe 55", params: { cellSizeM: 10 } }]);
  assert.match(m.get("a"), /cells of about 21\.5 × 21\.5 × 2\.2 m along the trend/);
  assert.match(m.get("b"), /10 m cells/);
});

test("wired: the pane's note, the run's record and the tooltip", () => {
  assert.match(readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8"), /const tc = numericCellSize > 0 \? trendCellM\(gt, numericCellSize\) : null;/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /cellAlongTrendM: trendCellM\(anisotropy\.trend, cs\)/);
  assert.match(r, /cells of about \$\{trendCellText\(trendCellM\(anisotropy\.trend, cs\)\)\} m along the trend/);
});

test("the 'left outside' line says each cause for its own composites (not estimated / estimated below the cutoff)", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /inShell\.noData \? tr\("\\"\{label\}\\" leaves \{n\} of its \{above\} composite\(s\) at\/above \{cutoff\} \{unit\} outside the shell on blocks that were not estimated/);
  assert.match(r, /inShell\.outside \? tr\("\\"\{label\}\\": \{n\} of its \{above\} composite\(s\) at\/above \{cutoff\} \{unit\} sit on blocks estimated below it/);
  assert.ok(!r.includes("({noData} of them on blocks that were not estimated)"), "the old line that blamed Min holes / the search for both");
});
