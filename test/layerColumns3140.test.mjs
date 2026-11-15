// TASKS.csv #3140 (step 1) — a custom layer's readers give the same answer on its rows as row objects and as a rowTable Table (what a big
// downhole log will be held as): the helpers, and each reader moved onto them. SYNTHETIC rows only: random numbers, numeric strings, blanks,
// nulls, codes and missing fields, binned (from / to / n) and point (depth) logs.
import test from "node:test";
import assert from "node:assert/strict";
import { isTable } from "../src/lib/rowTable.js"; import { tableFromRows } from "../src/lib/rowTableBuild.js";
import { fieldOf, fieldNames, countWhere, someWhere, firstWhere, rowAt, indicesWhere, rowsWhere, rowCount } from "../src/lib/layerColumns.js";
import { numericLayerFields } from "../src/lib/evidenceSources.js";
import { isNumericLayer } from "../src/lib/domainLayers.js";
import { numericSourceChoices, sourceAssays } from "../src/lib/numericSources.js";

let seed = 3140;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
function binnedLog(nHoles = 30, perHole = 40) {
  const rows = [];
  for (let h = 0; h < nHoles; h++) for (let k = 0; k < perHole; k++) {
    const r = { hole_id: `H${h}`, from: k * 0.5, to: k * 0.5 + 0.5, value: +(2 + rnd() * 2).toFixed(4), min: +(1 + rnd()).toFixed(3), max: +(3 + rnd()).toFixed(3), n: 1 + Math.floor(rnd() * 5), _src: "SYNTHETIC_log.csv" };
    if (rnd() < 0.03) r.value = pick([null, "", "x", "1.5", "-0.25"]);
    if (rnd() < 0.02) delete r.min;
    rows.push(r);
  }
  return rows;
}
function pointLog(nHoles = 25, perHole = 60) {
  const rows = [];
  for (let h = 0; h < nHoles; h++) for (let k = 0; k < perHole; k++) {
    const r = { hole_id: rnd() < 0.005 ? null : `P${h}`, depth: +(k * 0.1).toFixed(2), value: rnd() < 0.02 ? pick(["", null, "3.5", "abc"]) : +(rnd() * 200).toFixed(1), _src: "SYNTHETIC_pts.csv" };
    if (rnd() < 0.3) r.caliper = rnd() < 0.05 ? "" : +(96 + rnd() * 4).toFixed(1);
    if (rnd() < 0.1) r.code = pick(["A", "B", "C"]);
    rows.push(r);
  }
  return rows;
}

test("#3140 the helpers: the same on rows and on a Table of them", () => {
  for (const rows of [binnedLog(), pointLog(), []]) {
    const t = tableFromRows(rows);
    assert.ok(isTable(t) || rows.length === 0);
    assert.equal(rowCount(t), rows.length);
    if (rows.length) assert.deepEqual(fieldNames(t), fieldNames(rows));
    for (const f of ["hole_id", "value", "min", "depth", "caliper", "code", "absent"]) {
      const a = fieldOf(rows, f), b = fieldOf(t, f);
      for (let i = 0; i < rows.length; i += 7) assert.deepEqual(b(i), a(i), `${f} at ${i}`);
      for (const pred of [(v) => v == null, (v) => Number.isFinite(Number(v)) && v !== "" && v != null, (v) => v === "A", (v) => typeof v === "string"]) {
        assert.equal(countWhere(t, f, pred), countWhere(rows, f, pred), `count ${f}`);
        assert.equal(someWhere(t, f, pred), someWhere(rows, f, pred), `some ${f}`);
        assert.equal(firstWhere(t, f, pred), firstWhere(rows, f, pred), `first ${f}`);
        assert.deepEqual(indicesWhere(t, f, pred), indicesWhere(rows, f, pred), `indices ${f}`);
      }
    }
    if (rows.length) {
      assert.deepEqual(rowAt(t, 5), rows[5]); assert.equal(rowAt(rows, 5), rows[5]); // an array's own row; a Table's built for the call
      assert.deepEqual(rowsWhere(t, "hole_id", (h) => h === rows[0].hole_id), rowsWhere(rows, "hole_id", (h) => h === rows[0].hole_id));
    }
  }
});

test("#3140 the moved readers give the same answer on a Table: numericLayerFields, isNumericLayer, numericSourceChoices, sourceAssays", () => {
  const bin = binnedLog(), pts = pointLog();
  for (const rows of [bin, pts]) {
    const t = tableFromRows(rows);
    assert.deepEqual(numericLayerFields(t), numericLayerFields(rows));
    assert.deepEqual(numericLayerFields(t, { min: 1 }), numericLayerFields(rows, { min: 1 }));
    assert.equal(isNumericLayer(t), isNumericLayer(rows));
  }
  assert.equal(isNumericLayer(tableFromRows([{ value: "A" }, { value: "B" }, { value: 1 }])), false);
  const layersOf = (b, p) => [{ id: "L1", name: "Density", rows: b, unit: "g/cc", binM: 0.5, validRange: [2.1, 3.9], despikeM: 2 }, { id: "L2", name: "Gamma", rows: p, unit: "cps" }];
  const asRows = numericSourceChoices({ customLayers: layersOf(bin, pts) });
  const asTables = numericSourceChoices({ customLayers: layersOf(tableFromRows(bin), tableFromRows(pts)) });
  assert.deepEqual(asTables, asRows);
  assert.ok(asRows.length >= 3);
  for (const ch of asRows) {
    const a = sourceAssays(ch, { customLayers: layersOf(bin, pts) });
    const b = sourceAssays(ch, { customLayers: layersOf(tableFromRows(bin), tableFromRows(pts)) });
    assert.deepEqual(b, a, ch.key);
  }
  // the range and despike were exercised on the binned log's value
  const dens = sourceAssays(asRows.find((c) => c.key === "custom:L1:value"), { customLayers: layersOf(bin, pts) });
  assert.ok(dens.outOfRange > 0 && dens.despikeM === 2);
});

test("#3140 the log level of detail reads a Table as it reads the rows: the spacing, the point count, the coarse set's bins and tips", async () => {
  const THREE = await import("three");
  const { readingSpacingM, primeLogLod, pointAt, isPoint } = await import("../src/modules/viewer/logLod.js");
  const { buildCoarse } = await import("../src/modules/viewer/logLodBuild.js");
  const rows = [], traces = [];
  for (let h = 0; h < 20; h++) {
    traces.push({ hole_id: `H${h}`, pts: [{ md: 0, x: h * 20, y: 0, z: 0 }, { md: 100, x: h * 20, y: -100, z: 0 }] });
    for (let i = 0; i < 1200; i++) rows.push({ hole_id: `H${h}`, depth: +(i * 0.05).toFixed(2), value: 20 + (i % 10), _src: "SYNTHETIC_gamma.csv" });
  }
  rows.push({ hole_id: "H0", from: 1, to: 2, value: 5 }); // an interval row: not a point
  const t = tableFromRows(rows);
  const pr = pointAt(rows), pt = pointAt(t);
  for (let i = 0; i < rows.length; i += 97) assert.equal(pt(i), pr(i)); assert.equal(pt(rows.length - 1), isPoint(rows[rows.length - 1]));
  assert.equal(readingSpacingM(t), readingSpacingM(rows));
  const tips = (layerRows) => {
    const g = new THREE.Group();
    primeLogLod(g, { id: "g", name: "Gamma", unit: "ppm", rows: layerRows }, {});
    assert.ok(g.userData.logLod, "primed (24,000 points)");
    buildCoarse(g, g.userData.logLod, traces, { H3: false });
    return { spacing: g.userData.logLod.spacingM, tips: g.userData.logLod.coarse.flatMap((c) => (c.userData?.compact?.rows || []).map((r) => r.tip)) };
  };
  const a = tips(rows), b = tips(t);
  assert.equal(b.spacing, a.spacing); assert.deepEqual(b.tips, a.tips); assert.ok(a.tips.length > 100 && !a.tips.some((x) => x.startsWith("H3\n")), "hole H3 hidden");
});

test("#3140 a custom layer's colours read a Table as they read the rows: the fields, the numeric ramp, the code colours", async () => {
  const { customFields, customScaleDefault, customCodeColour, customColour } = await import("../src/lib/customColour.js");
  const rows = pointLog();
  const L = { id: "c1", name: "Gamma", rows }, LT = { id: "c1", name: "Gamma", rows: tableFromRows(rows) };
  assert.deepEqual(customFields(LT), customFields(L));
  for (const f of ["value", "caliper", "code"]) assert.deepEqual(customScaleDefault(LT, f), customScaleDefault(L, f), f);
  for (const v of ["A", "B", "C", "Z"]) assert.equal(customCodeColour(LT, "code", v), customCodeColour(L, "code", v));
  const styles = { "custom:c1": { colourBy: "caliper" } };
  for (let i = 0; i < rows.length; i += 53) assert.equal(customColour(LT, styles, rows[i]), customColour(L, styles, rows[i]));
});
