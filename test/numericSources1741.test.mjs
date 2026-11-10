// TASKS.csv #1741 / #1708 (review #1645, Copley) — numeric downhole logs and numeric custom-layer fields as an estimation /
// grade-shell source
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericSourceChoices, findNumericSource, sourceAssays, logPoints, unlogGrid, CUSTOM_UNIT } from "../src/lib/numericSources.js";

const layers = {
  magsusc: [{ hole_id: "H1", depth: 10, value: 0.5 }, { hole_id: "H1", depth: 11, value: "0.9" }, { hole_id: "H1", depth: 12, value: 0 }, { hole_id: "H2", depth: 5, value: "" }],
  sg: [{ hole_id: "H1", from: 0, to: 2, value: 2.7 }, { hole_id: "H1", from: 2, to: 4, value: 2.9 }], // too few
};
const customLayers = [
  { id: "c2", name: "Cpy %", rows: [{ hole_id: "H1", from: 0, to: 3, value: 1.5 }, { hole_id: "H1", from: 3, to: 6, value: "2" }, { hole_id: "H1", from: 6, to: 9, value: 0.1 }] },
  { id: "c1", name: "SWIR", rows: [{ hole_id: "H1", depth: 4, value: "WM", ai_wav: 2201 }, { hole_id: "H1", depth: 4.5, value: "WM", ai_wav: 2204 }, { hole_id: "H1", depth: 7, value: "KAO", ai_wav: 2198 }, { hole_id: "H2", from: 1, to: 1, value: "WM", ai_wav: 2210 }] },
];

test("the choices: the built-in numeric logs with 3+ readings, then every numeric field of each custom layer by name", () => {
  const c = numericSourceChoices({ layers, customLayers });
  assert.deepEqual(c.map((s) => s.key), ["log:magsusc", "custom:c1:ai_wav", "custom:c2:value"]); // #2397: custom fields by reading count (4, 3), not by name
  assert.deepEqual(c.map((s) => [s.label, s.unit, s.n, s.logScale]), [["Mag. susc.", "SI", 3, true], ["SWIR › ai_wav", CUSTOM_UNIT, 4, false], ["Cpy %", CUSTOM_UNIT, 3, false]]); // #2397 order
  assert.equal(findNumericSource("custom:c1:ai_wav", { layers, customLayers })?.label, "SWIR › ai_wav");
  assert.equal(findNumericSource("Au", { layers, customLayers }), null); // an assay symbol is not a source
  assert.equal(findNumericSource("log:sg", { layers, customLayers }), null);
});

test("the rows become assay-shaped intervals; depth-only readings get a short support", () => {
  const ms = sourceAssays(findNumericSource("log:magsusc", { layers, customLayers }), { layers, customLayers });
  assert.deepEqual(ms.assayElements, [{ symbol: "Mag. susc.", unit: "SI" }]);
  assert.deepEqual([ms.pointRows, ms.pointSupport, ms.skipped], [3, 1, 1]); // 1 m apart: the default 1 m; the blank reading skipped
  assert.deepEqual(ms.assays[0], { hole_id: "H1", from: 9.5, to: 10.5, values: { "Mag. susc.": 0.5 }, source: "log" });
  assert.equal(ms.assays[1].values["Mag. susc."], 0.9);
  const sw = sourceAssays(findNumericSource("custom:c1:ai_wav", { layers, customLayers }), { layers, customLayers });
  assert.equal(sw.pointSupport, 0.5); // readings 0.5 m apart: the support follows
  assert.deepEqual(sw.assays.find((a) => a.hole_id === "H2"), { hole_id: "H2", from: 0.75, to: 1.25, values: { "SWIR › ai_wav": 2210 }, source: "log" }); // from === to: a point
  const cpy = sourceAssays(findNumericSource("custom:c2:value", { layers, customLayers }), { layers, customLayers });
  assert.deepEqual([cpy.pointRows, cpy.pointSupport, cpy.assays[1]], [0, null, { hole_id: "H1", from: 3, to: 6, values: { "Cpy %": 2 }, source: "log" }]);
});

test("log10 values with a floor, and the grid back to data units", () => {
  const l = logPoints([{ value: 0 }, { value: 1 }, { value: 10 }, { value: 100 }]);
  assert.deepEqual([l.floor, l.belowFloor], [0.5, 1]);
  assert.deepEqual(l.points.map((p) => +p.value.toFixed(4)), [-0.301, 0, 1, 2]);
  const g = unlogGrid({ values: new Float64Array([0, 1, NaN, 2]) });
  assert.deepEqual([...g.values].map((v) => (Number.isNaN(v) ? "nan" : v)), [1, 10, "nan", 100]);
});

test("the dialogs: a Source select in Estimation, the logs in the Grade shell element list, the runner resolves a source key", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /numericSourceChoices\(\{ layers, customLayers(, models: false[^}]*)? \}\)/); // models: #2397
  assert.match(m, /const assaysIn = sourceData \? sourceData\.assays : assaysProp, assayElements = sourceData \? sourceData\.assayElements : assayElementsProp;/);
  assert.match(m, /<option value="assay">\{tr\("Assays"\)\}<\/option>/);
  assert.match(m, /if \(logValues\) logInfo = logPoints\(points\);/);
  assert.equal((m.match(/runEstimation\("block", estPts, \{/g) || []).length, 2); // the raw points stay for the checks
  assert.match(m, /c\.value = unlogValue\(c\.value\)/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<optgroup label=\{tr\("Downhole logs and numeric layers"\)\}>/);
  assert.match(p, /const numSrc = findNumericSource\(numericSymbol, \{ layers, customLayers: customLayersAll \}\);/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const numSrc = findNumericSource\(numericSymbol, \{ layers, customLayers \}\);/);
  assert.match(r, /const logInfo = numSrc\?\.logScale \? logPoints\(gridPoints\) : null;/);
  assert.match(r, /if \(logInfo\) unlogGrid\(grid\);/);
});
