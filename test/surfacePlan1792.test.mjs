// TASKS.csv #1792 / #1864 (review #1646, Kodiak) — Geochem > Plan map: surface samples in plan over a block-model level slice, to Layout
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planExtent, fitTransform, modelLevels, topLevelWithValues, defaultPlanLevel, modelSliceAt, niceScaleBar, modelAirValue, modelFootprint, padBox, inBox } from "../src/lib/surfacePlan.js";

test("#1792 the extent pads the samples and gives a lone sample a box; the fit keeps one scale on both axes", () => {
  const e = planExtent([{ x: 0, y: 0 }, { x: 1000, y: 500 }, { x: NaN, y: 3 }]);
  assert.deepEqual(e.map((v) => +v.toFixed(1)), [-60, -30, 1060, 530]);
  const one = planExtent([{ x: 10, y: 20 }]);
  assert.ok(one[2] - one[0] >= 100);
  assert.equal(planExtent([]), null);
  const T = fitTransform([0, 0, 2000, 500], 1000, 750);
  assert.equal(T.mPerPx, 2, "the wider axis decides");
  assert.deepEqual(T.toPx(1000, 250), [500, 375], "centred");
  assert.deepEqual(T.toPx(0, 250), [0, 375]);
  assert.deepEqual(T.box.map((v) => +v.toFixed(3)), [0, -500, 2000, 1000]);
});

test("#1792 levels, the top level with values (below air) and the cells a level cuts", () => {
  const cells = [];
  for (const z of [1525, 1475, 1425]) for (const x of [0, 50]) cells.push({ x, y: 0, z, dx: 50, dy: 50, dz: 50, value: z === 1525 ? NaN : x + z });
  const m = { cells };
  assert.deepEqual(modelLevels(m), [1525, 1475, 1425]);
  assert.equal(topLevelWithValues(m), 1475, "the 1525 m layer is air");
  assert.deepEqual(modelSliceAt(m, 1475).map((c) => c.value), [1475, 1525]);
  assert.deepEqual(modelSliceAt(m, 1450).map((c) => c.z), [1475, 1475], "1450 lies in the 1475 cell's [1450, 1500)");
  assert.deepEqual(modelSliceAt(m, 1525), [], "air has no value");
});

test("#1792 a model saved before air masking (-1 above the ground, as Kodiak's chargeability) has its air left out of slices", () => {
  const cells = [];
  // 10 x 10 columns of 50 m, 4 levels; ground at the 2nd level except one hill column that reaches the top level
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (const [k, z] of [1525, 1475, 1425, 1375].entries()) {
    const hill = i === 0 && j === 0, ground = hill ? k >= 0 : k >= 1;
    cells.push({ x: 25 + 50 * i, y: 25 + 50 * j, z, dx: 50, dy: 50, dz: 50, value: ground ? 2 + i * 0.1 : -1 });
  }
  const m = { cells };
  assert.equal(modelAirValue(m), -1);
  assert.equal(m.cells.filter((c) => c.value === -1).length, 99, "the model is not changed");
  assert.equal(topLevelWithValues(m), 1525, "the hill column");
  assert.equal(defaultPlanLevel(m), 1475, "most of the model is ground from 1475 m down");
  assert.equal(modelSliceAt(m, 1525).length, 1);
  assert.ok(modelSliceAt(m, 1475).every((c) => c.value !== -1));
  assert.deepEqual(modelFootprint(m), [0, 0, 500, 500]);
  assert.deepEqual(padBox([0, 0, 100, 200], 0.1), [-10, -20, 110, 220]);
  assert.ok(inBox([0, 0, 10, 10], 10, 0) && !inBox([0, 0, 10, 10], 10.1, 0));
  assert.equal(modelAirValue({ cells: [{ value: -2 }, { value: 3 }, { value: -1 }] }), null, "several negatives: real values, not air");
});

test("#1792 the scale bar is a round length that fits", () => {
  assert.deepEqual(niceScaleBar(2, 180), { m: 200, px: 100, label: "200 m" });
  assert.deepEqual(niceScaleBar(20, 180).label, "2 km");
  assert.equal(niceScaleBar(0.5, 180).m, 50);
});

test("#1864 the plan goes to Layout as an image with its real-world width and legend rows; Geochem opens it", () => {
  const c = readFileSync(new URL("../src/components/SurfacePlanMap.jsx", import.meta.url), "utf8");
  assert.ok(c.includes("addLayoutImage({ label: title, src: cv.toDataURL(\"image/png\"), naturalW: W, naturalH: H, worldWidthAtCaptureM: W * Number(cv.dataset.mPerPx || 0) || null, planMap: true, legendItems: legendItems() })"));
  const lay = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(lay.includes("planMap: !!img.planMap") && lay.includes('tr("Assign scale bar to this map")'));
  assert.ok(c.includes('anomalyClasses(surfaceSamples, { mode: "element", symbol, scheme: "threshold" }'));
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes('label="Plan map"') && g.includes("<SurfacePlanMap onClose="));
});
