// TASKS.csv #3258 (Galore review) — the 3D slice on a property with one cluster and far-flung holes opened on empty ground with a range of
// ALL holes and said nothing. The range is the checked holes', a vertical slab opens on their median collar, and the readout gives the slab's
// centre and the holes in it (or says none). Synthetic holes, not Galore.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sliceTraces, medianCollarPos, slabSummary, slabSummaryText } from "../src/lib/viewer/slicePlace.js";

// a cluster of 16 vertical holes around x 0-150, and 4 far-flung ones out to 29 km east (scene x east, z = -north)
const hole = (id, x, z) => ({ hole_id: id, pts: [{ x, y: 0, z }, { x, y: -300, z }] });
const cluster = Array.from({ length: 16 }, (_, i) => hole(`CZ${i}`, (i % 4) * 50, -Math.floor(i / 4) * 50));
const far = [hole("F1", 9000, -2000), hole("F2", 18000, 500), hole("F3", 24000, -1000), hole("F4", 29000, 0)];
const all = [...cluster, ...far];
const extOf = (ts) => { const p = ts.flatMap((t) => t.pts); return { x0: Math.min(...p.map((q) => q.x)), x1: Math.max(...p.map((q) => q.x)), y0: -300, y1: 0, z0: Math.min(...p.map((q) => q.z)), z1: Math.max(...p.map((q) => q.z)) }; };

test("the checked holes set the range; all of them when none (or every one) is unchecked", () => {
  const vh = Object.fromEntries(far.map((t) => [t.hole_id, false]));
  assert.equal(sliceTraces(all, vh).length, 16);
  assert.equal(sliceTraces(all, {}).length, 20);
  assert.equal(sliceTraces(all, Object.fromEntries(all.map((t) => [t.hole_id, false]))).length, 20);
});

test("a vertical slab striking north opens on the median collar, which is in the cluster, not the middle of 29 km", () => {
  const ext = extOf(all), pos = medianCollarPos(all, ext, 0);
  assert.ok(pos < 0.01, `pos ${pos}`);
  const s = slabSummary(all, ext, { on: true, mode: "vertical", azimuth: 0, pos, thickness: 50 }, { x: 500000, y: 7000000 });
  assert.ok(s.holes >= 4, `${s.holes} holes`);
  assert.equal(slabSummary(all, ext, { on: true, mode: "vertical", azimuth: 0, pos: 0.5, thickness: 50 }, { x: 0, y: 0 }).holes, 0, "the old opening: nothing");
  assert.match(slabSummaryText(s), /^ · centred on [\d,]+ E, [\d,]+ N · \d+ holes in the slab$/);
  assert.match(slabSummaryText({ e: 1, n: 2, holes: 0 }), /no hole in the slab: move it or turn it/);
  assert.equal(slabSummary(all, ext, { on: true, mode: "horizontal", pos: 0.5, thickness: 50 }), null, "horizontal says its elevation already");
});

test("wiring: the extent from the checked holes, placed once per turn-on, the readout", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const base = sliceTraces\(tracesRef\.current, visibleHoles\), ts = mainTraces\(base,/);
  assert.match(v, /\}, \[slice3d\.on, collars, survey, rebuildSeq, visibleHoles\]\);/);
  assert.match(v, /const pos = medianCollarPos\(sliceExtent\.traces, sliceExtent, slice3d\.azimuth\);/);
  assert.match(v, /slabSummaryText\(slabSummary\(sliceExtent\?\.traces, sliceExtent, slice3d, originRef\.current\)\)/);
});
