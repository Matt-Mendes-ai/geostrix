// TASKS.csv #3257 (Galore Creek review; a regression of #660) — an estimated block model was saved as raw cell objects again: the compaction
// took the keys of the first cell and refused a model whose cells did not all share them, and #2417's 'beyond' (and #2596 nearUnsampled,
// #2721 fromLog, #1617 holeShare, #709 kv, #3014 domain) is set on some cells only. Three 40,770-cell models made a 37 MB file.
import test from "node:test";
import assert from "node:assert/strict";
import { compactVoxelModels, expandVoxelModels, PROJECT_VERSION } from "../src/lib/projectFields.js";
import { estimateBlockModel } from "../src/lib/estimation.js";

// a synthetic estimate: vertical holes on a 60 m grid sampled from 0 to -80 m, the box from +40 to -160 m, so blocks above and below every
// sample they use carry #2417's 'beyond'; one-hole blocks carry holeShare
function syntheticEstimate() {
  const pts = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 40; k++) {
    pts.push({ x: i * 60, y: j * 60, z: -2 * k - 1, value: 0.2 + 0.05 * ((i * 7 + j * 3 + k) % 11), hole_id: `H${i}_${j}`, len: 2 });
  }
  return estimateBlockModel(pts, { bounds: { xmin: -30, xmax: 330, ymin: -30, ymax: 330, zmin: -160, zmax: 40 }, cellSize: { dx: 15, dy: 15, dz: 10 }, method: "idw2", searchRadius: 90, minSamples: 1, maxSamples: 16, minHoles: 1, support: true });
}

test("a real estimate whose cells differ in keys (beyond on some) is written as columns and comes back exactly", () => {
  const r = syntheticEstimate();
  const cells = r.cells;
  assert.ok(cells.length > 4000, `${cells.length} blocks`);
  const withBeyond = cells.filter((c) => c.beyond).length;
  assert.ok(withBeyond > 0 && withBeyond < cells.length, `beyond on ${withBeyond} of ${cells.length}: some cells only`);
  const keySets = new Set(cells.map((c) => Object.keys(c).sort().join(",")));
  assert.ok(keySets.size > 1, "the cells do not share their keys (the case #660's compaction refused)");
  const m = { id: "e1", name: "Cu IDW", source: "estimate-idw2", cells };
  const [c] = compactVoxelModels([m]);
  assert.ok(c.compactCells && !c.cells, "written as columns");
  const raw = JSON.stringify(m).length, packed = JSON.stringify(c).length;
  assert.ok(packed < raw / 2, `${packed} vs ${raw}`); // #660's measure
  const [back] = expandVoxelModels([JSON.parse(JSON.stringify(c))]);
  back.cells.forEach((b, i) => {
    const a = cells[i];
    assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), `cell ${i}: the same keys, absent ones absent`);
    for (const k of Object.keys(a)) {
      if (typeof a[k] !== "number" || k === "value") assert.equal(b[k], a[k], `${k} of cell ${i}`); // text, flags and the value exact
      else assert.ok(Number.isNaN(a[k]) ? Number.isNaN(b[k]) : Math.abs(b[k] - a[k]) <= 1e-6 * Math.max(1, Math.abs(a[k])) + 1e-3, `${k} ${b[k]} vs ${a[k]}`);
    }
  });
});

test("a 40,770-cell model with the estimate's optional keys: a fraction of its raw size (the review: three of them, 37 MB)", () => {
  const cells = Array.from({ length: 40770 }, (_, i) => {
    const c = { x: 360000 + (i % 45) * 25, y: 6280000 + (Math.floor(i / 45) % 30) * 25, z: 900 - Math.floor(i / 1350) * 10, dx: 25, dy: 25, dz: 10, value: 0.01 * (i % 313), nSamples: 1 + (i % 16), nHoles: 1 + (i % 4) };
    if (c.nHoles === 1) c.holeShare = 1; else if (i % 5) c.holeShare = (i % 100) / 100;
    if (i % 23 === 0) c.beyond = i % 2 ? "above" : "below";
    if (i % 41 === 0) c.nearUnsampled = true;
    if (i % 3 === 0) c.domain = i % 6 ? "porphyry" : null;
    c.support = ["interpolated", "extrapolated", "one hole"][i % 3]; c.supportIndex = (i % 10) / 10; c.nearestSampleM = (i % 90) * 1.5;
    return c;
  });
  const m = { id: "big", name: "Au", source: "estimate-idw2", cells };
  const [c] = compactVoxelModels([m]);
  const raw = JSON.stringify(m).length, packed = JSON.stringify(c).length;
  assert.ok(c.compactCells, "compacted");
  assert.ok(raw > 6e6 && packed < raw / 2, `raw ${(raw / 1e6).toFixed(1)} MB, compacted ${(packed / 1e6).toFixed(2)} MB`); // #660's measure; measured 7.4 -> 3.1 MB
  assert.ok(c.compactCells.cols.dx.same && !c.compactCells.cols.dx.b64, "a column the same in every cell is one value");
  const [back] = expandVoxelModels([JSON.parse(JSON.stringify(c))]);
  for (const i of [0, 1, 3, 6, 23, 41, 46, 4099, 40769]) {
    const a = cells[i], b = back.cells[i];
    assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), `cell ${i}`);
    for (const k of ["beyond", "nearUnsampled", "domain", "support", "value"]) assert.equal(b[k], a[k], `${k} of cell ${i}`);
  }
});

test("nulls, booleans, text and absent keys round-trip; a key of two kinds or an object value stays raw; the format version moved", () => {
  const cells = [{ x: 1, y: 2, z: 3, value: 0.5, flag: true, tag: "a", d: null }, { x: 2, y: 2, z: 3, value: 0.7, flag: false, d: "x" }, { x: 3, y: 2, z: 3, value: NaN, tag: "b" }];
  const [c] = compactVoxelModels([{ id: "t", cells }]);
  assert.ok(c.compactCells);
  const back = expandVoxelModels([JSON.parse(JSON.stringify(c))])[0].cells;
  assert.deepEqual(back.slice(0, 2), cells.slice(0, 2));
  assert.equal(back[2].tag, "b"); assert.ok(Number.isNaN(back[2].value)); assert.ok(!("flag" in back[2]) && !("d" in back[2]));
  const kinds = { id: "k", cells: [{ x: 1, value: 1 }, { x: 2, value: "1" }] };
  assert.equal(compactVoxelModels([kinds])[0], kinds);
  const obj = { id: "o", cells: [{ x: 1, value: 1, extra: { a: 1 } }] };
  assert.equal(compactVoxelModels([obj])[0], obj);
  assert.ok(PROJECT_VERSION >= 29, "an older GeoStrix is warned (#342): it would read an absent key as 0");
});
