// TASKS.csv #2040 (review #2013, Woodjam) — a fence series makes sections only where a slab holds data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fenceLinesWithData, fenceSectionCount } from "../src/lib/sectionDefs.js";

// three clusters of collars 300 m wide, 3-5 km apart east-west: N-S lines (azimuth 0) every 50 m
const cluster = (x0) => Array.from({ length: 20 }, (_, i) => ({ x: x0 + (i % 5) * 75, y: 5000 + Math.floor(i / 5) * 60 }));
const pts = [...cluster(608300), ...cluster(611200), ...cluster(612750)];

test("only the slabs with points are kept; the count says how many were skipped", () => {
  const r = fenceLinesWithData(pts, 0, 50);
  assert.ok(r.all > 85, String(r.all));
  assert.ok(r.lines.length <= 3 * 8, String(r.lines.length)); // ~7 per 300 m cluster
  assert.equal(r.empty, r.all - r.lines.length);
  for (const ln of r.lines) assert.ok(pts.some((p) => Math.abs(p.x - ln.t) <= 25), ln.name);
  assert.equal(fenceSectionCount(pts, 0, 50), r.lines.length);
  assert.deepEqual(fenceLinesWithData([], 0, 50), { lines: [], all: 0, empty: 0 });
});

test("a long trace segment keeps the slabs it crosses", () => {
  const traces = [{ wx: [0, 5000], wy: [0, 0] }];
  const r = fenceLinesWithData([{ x: 0, y: 0 }, { x: 5000, y: 0 }], 0, 1000, traces);
  assert.equal(r.empty, 0);
  assert.equal(fenceLinesWithData([{ x: 0, y: 0 }, { x: 5000, y: 0 }], 0, 1000).empty, 4, "points alone would skip them");
});

test("a dense model's cell corners keep their slabs", () => {
  const cells = []; for (let x = 0; x < 1000; x += 25) cells.push({ x, y: 0 }, { x: x + 25, y: 0 });
  const r = fenceLinesWithData(cells, 0, 50);
  assert.equal(r.empty, 0);
});

test("the generator and the pane use it", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("const { lines, empty: emptySlabs } = fenceLinesWithData(pts, sliceSeriesAzimuth, width, tracesRef.current);"));
  assert.ok(readFileSync(new URL("../src/modules/viewer/FenceOptions.jsx", import.meta.url), "utf8").includes("slab(s) with no hole or model cell are skipped"));
});
