// TASKS.csv #1706 (review #1645, Copley) — the level plan's 'Colour holes by' offered interval logs and assay elements only: a log read
// at a depth (Mag. susc., Mineralization points, a custom point layer such as SWIR minerals, a downhole log stored as zero-length intervals)
// now fills each pierce point with its reading nearest the RL inside the slab.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planBuildNow, nearestReadings } from "../src/modules/viewer/levelPlanBuild.js";

// n vertical holes from 400 m to 300 m; a lithology log; mag susc every 3 m; a SWIR point every 7 m; a density log as zero-length rows
function ctxOf(n, { withMineralInterval = false } = {}) {
  const traces = [], intervals = [], points = [];
  for (let h = 0; h < n; h++) {
    const id = `H${h}`, pts = [], wx = [], wy = [], wz = [];
    for (let md = 0; md <= 100; md += 10) { pts.push({ md }); wx.push(h * 25); wy.push(0); wz.push(400 - md); }
    traces.push({ hole_id: id, pts, wx, wy, wz });
    intervals.push({ hole_id: id, layer: "litho", from: 0, to: 100, color: "#aa0000", label: "Lithology: BIF" });
    for (let d = 1; d < 100; d += 3) points.push({ hole_id: id, md: d, color: `#0000${String(d).padStart(2, "0")}`, label: `Mag. susc.: ${d}`, layer: "magsusc" });
    for (let d = 2; d < 100; d += 7) points.push({ hole_id: id, md: d, color: "#00aa00", label: `SWIR: ${d % 2 ? "Kaolinite" : "Illite"}`, layer: "custom:swir" });
    for (let d = 0; d < 100; d += 0.5) intervals.push({ hole_id: id, layer: "custom:dens", from: d, to: d, color: "#222222", label: `Density_Best: ${2 + d / 100}` });
    if (withMineralInterval) { intervals.push({ hole_id: id, layer: "mnlgy", from: 40, to: 60, color: "#ffcc00", label: "Mineralization: PY" }); points.push({ hole_id: id, md: 50, color: "#000", label: "Mineralization: CPY", layer: "mnlgy" }); }
  }
  return {
    traces, visibleHoles: {}, cache: { current: null }, layerVisible: {}, layers: {},
    layerPrimitivesFor: () => ({ intervals, points }),
    isRowVisible: () => true, effectiveColor: () => "#000", effectiveLabel: (k, v) => v,
    voxelModels: [], voxelCellShown: () => true, colorForVoxelValue: () => "#000", origin: { x: 0, y: 0, z: 0 }, implicitSurfaces: [], implicitMeshes: {},
    plannedHoles: [], plannedHoleTrace: () => null, assayLegend: () => [], projectValues: () => [],
  };
}

test("nearestReadings: each layer's reading nearest the depth, inside the slab runs only", () => {
  const rows = [{ md: 10, layer: "a" }, { md: 14, layer: "a" }, { md: 30, layer: "a" }, { md: 13, layer: "b" }, { md: 80, layer: "c" }];
  const r = nearestReadings(rows, [[8, 20]], 15);
  assert.deepEqual(r.map((x) => [x.layer, x.md]).sort(), [["a", 14], ["b", 13]]);
  assert.deepEqual(nearestReadings(rows, [], 15), []);
  assert.deepEqual(nearestReadings(undefined, [[0, 1]], 0), []);
});

test("a pierce point takes the mag susc, SWIR and zero-length log readings nearest it, with their depth", () => {
  const p = planBuildNow(ctxOf(3), 350, 5); // the RL at md 50, the slab md 45-55
  const pc = p.holes[0].pierce[0];
  const by = Object.fromEntries(pc.logs.map((l) => [l.layer, l]));
  assert.equal(by.magsusc.label, "Mag. susc.: 49 (49.0 m)"); // readings at 46, 49, 52, 55
  assert.equal(by["custom:swir"].label, "SWIR: Kaolinite (51.0 m)"); // at 44 (out of the slab), 51
  assert.equal(by["custom:dens"].label, "Density_Best: 2.5 (50.0 m)");
  assert.equal(by.litho.label, "Lithology: BIF", "the interval logs as before");
  assert.equal(p.pointLogs.filter((r) => r.layer === "magsusc").length, 3, "one row per pierce point filled, for the choice and the legend");
  assert.ok(p.pointLogs.every((r) => !/\(\d/.test(r.label)), "the legend rows carry the plain reading (a number stays a number)");
  assert.ok(!p.intervals.some((iv) => iv.layer === "custom:dens"), "zero-length rows are not drawn as runs");
  assert.ok(!p.points.some((pt) => pt.layer === "custom:dens"), "nor as dots");
});

test("a logged interval of the same layer at the pierce point wins over a point reading", () => {
  const p = planBuildNow(ctxOf(2, { withMineralInterval: true }), 350, 5);
  const m = p.holes[0].pierce[0].logs.filter((l) => l.layer === "mnlgy");
  assert.deepEqual(m.map((l) => l.label), ["Mineralization: PY"]);
});

test("wiring: ViewerModule's point primitives carry their layer; the window offers the point logs and keys them in the legend", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /label: `\$\{meta\.label\}: \$\{label\}`, layer: key, value: meta\.numeric \? row\.value : undefined \}\); \/\/ layer: #1706; value: #3362/);
  assert.match(v, /label: `\$\{nm\}: \$\{row\.value\}`, layer: `custom:\$\{layer\.id\}`, value: row\.value \}\); \/\/ value: #3362/); // nm: #2979
  const w = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /\.\.\.data\.intervals\.map\(\(iv\) => iv\.layer\), \.\.\.pointLogs\.map\(\(r\) => r\.layer\)/);
  assert.match(w, /planLegend\(data\.intervals\.some\(\(iv\) => iv\.layer === activeLayer\) \? data\.intervals : pointLogs, activeLayer,/);
});
