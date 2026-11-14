// TASKS.csv #3080 / #3079 — the downhole and across-the-holes fits side by side; the flat search handed to Estimation. Known values.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fitVariogramModel } from "../src/lib/variogram.js";
import { anisotropyFromFits, sendFlatSearchToEstimation, lastEstimateSettings, estimateSettingsKey } from "../src/lib/estimateMemory.js";

const spherical = (h, c0, c, a) => (h >= a ? c0 + c : c0 + c * (1.5 * (h / a) - 0.5 * (h / a) ** 3));
const bins = (c0, c, a, step, n) => Array.from({ length: n }, (_, i) => { const h = (i + 1) * step; return { h, gamma: spherical(h, c0, c, a), nPairs: 500 }; });

test("a spherical variogram's range is recovered, and two ranges give the anisotropy", () => {
  const down = fitVariogramModel(bins(0.1, 0.9, 40, 5, 20), { model: "spherical" });
  const across = fitVariogramModel(bins(0.1, 0.9, 400, 40, 20), { model: "spherical" });
  assert.ok(Math.abs(down.range - 40) < 4, `downhole range ${down.range}`);
  assert.ok(Math.abs(across.range - 400) < 40, `across range ${across.range}`);
  const an = anisotropyFromFits(down, across);
  assert.ok(Math.abs(an.ratio - 10) < 1.5 && an.flat);
});
test("close ranges are not flat; a missing fit gives nothing", () => {
  assert.equal(anisotropyFromFits({ range: 100 }, { range: 150 }).flat, false);
  assert.equal(anisotropyFromFits({ range: 100 }, null), null);
  assert.equal(anisotropyFromFits({ range: 0 }, { range: 150 }), null);
});
test("the flat search goes to the next Estimation dialog's settings, nothing else is touched", () => {
  const project = { id: "p3080" };
  lastEstimateSettings.set(estimateSettingsKey(project), { symbol: "Fe", method: "ok" });
  const n = sendFlatSearchToEstimation(project, { radiusM: 412.3456, reachM: 41.239 });
  assert.deepEqual([n.searchRadius, n.flatReach, n.symbol, n.method], [412.3, 41.24, "Fe", "ok"]);
  assert.equal(lastEstimateSettings.get("p3080").flatReach, 41.24);
});
test("wiring", () => {
  const s = fs.readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /anisotropyFromFits\(kept\.downhole, kept\.across\)/);
  assert.match(s, /sendFlatSearchToEstimation\(project, \{ radiusM: an\.acrossM, reachM: an\.downholeM \}\)/);
});
