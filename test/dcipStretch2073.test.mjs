// TASKS.csv #2073 (review #2013, Geophysics) — the DC section stretched over every cell (0.017-8,800 ohm·m) and the block-model card showed three
// maxima for one model (Max box 8,801, slider 1,385, Range 1,385).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rampRange } from "../src/lib/dcipSectionImage.js";
const d = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const v = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the on-screen section uses the exported image's range: 2nd-98th percentile of the seen cells, not their min-max", () => {
  const vals = Float64Array.from({ length: 100 }, (_, i) => (i === 0 ? 0.017 : i === 99 ? 8800 : 20 + i * 2));
  const env = new Float64Array(100).fill(1);
  const r = rampRange(vals, env, 0.02, true);
  assert.ok(r.lo > 0.017 && r.hi < 8800, JSON.stringify(r));
  assert.match(d, /const ramp = useMemo\(\(\) => rampRange\(vals, env, cutoff, field === "resistivity"\)/);
  assert.match(d, /stops: logStops\(ramp\.lo, ramp\.hi\)/);
  assert.match(d, /colours over \{v\}–\{v2\} ohm·m \(log: dark red conductive → light blue resistive; the 2nd–98th percentile of the cells the data see, the model runs \{a\}–\{b\}\)/);
});
test("the observed resistivity voxel takes the same percentiles", () => {
  assert.match(d, /if \(kind === "extrapolated" \|\| method === "dc"\) \{ lo = percentile\(vals, 0\.02\); hi = percentile\(vals, 0\.98\); \}/);
});
test("the range row shows one maximum and stores the cells' extent at the ends, so nothing is hidden", () => {
  assert.match(v, /const shown = \(v, fallback\) => Math\.min\(Math\.max\(Number\.isFinite\(v\) \? v : fallback, model\.min\), model\.max\);/);
  assert.match(v, /const storeMin = \(v\) => \(v <= model\.min \? ext\.lo : v\), storeMax = \(v\) => \(v >= model\.max \? ext\.hi : v\);/);
  assert.match(v, /onUpdate\(model\.id, \{ threshold: ext\.lo, rangeMax: ext\.hi \}\)/);
  assert.match(v, /const visibleCount = model\.cells\.filter\(\(c\) => c\.value >= bandLo && c\.value <= bandHi/);
});
