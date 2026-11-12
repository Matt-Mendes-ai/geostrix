// TASKS.csv #2797 — a collar commit that moves the collars' mean by less than 50 m keeps the scene origin, so the drillhole build
// stays incremental (only the changed holes desurveyed, only the groups with rows in them rebuilt)
import test from "node:test";
import assert from "node:assert/strict";
import { keptOrigin, planHoles, ORIGIN_KEEP_M } from "../src/modules/viewer/drillholeScene.js";
import { viewerSource } from "./helpers/viewerSource.mjs";

const prev = { ox: 500000, oy: 6700000, oz: 300 };

test("within 50 m of the last origin the origin is kept; farther, the new mean", () => {
  assert.equal(ORIGIN_KEEP_M, 50);
  assert.deepEqual(keptOrigin(prev, { ox: 500000.4, oy: 6700000.3, oz: 300.2 }), prev);
  assert.deepEqual(keptOrigin(prev, { ox: 500060, oy: 6700000, oz: 300 }), { ox: 500060, oy: 6700000, oz: 300 });
  assert.deepEqual(keptOrigin(undefined, { ox: 1, oy: 2, oz: 3 }), { ox: 1, oy: 2, oz: 3 }, "first build");
  assert.deepEqual(keptOrigin({ ox: NaN, oy: 0, oz: 0 }, { ox: 0.1, oy: 0, oz: 0 }), { ox: 0.1, oy: 0, oz: 0 }, "never keeps a bad origin");
});

test("with the kept origin a collar commit is incremental: only the new and the changed collars are desurveyed", () => {
  const cs = Array.from({ length: 1000 }, (_, i) => ({ hole_id: `H${i}`, x: 500000 + i, y: 6700000, z: 300, dip: -90, azimuth: 0, depth: 50 }));
  const entries = new Map(cs.map((c) => [c.hole_id, { collar: c, hs: [], method: "m", raw: [{}], pts: [{}], trace: {} }]));
  const o0 = { ox: cs.reduce((s, c) => s + c.x, 0) / cs.length, oy: 6700000, oz: 300 }; // the last build's origin: their mean
  const cache = { ...o0, rebuildSeq: 0, holes: entries };
  // one collar corrected and one added: the mean moves ~0.5 m
  const next = [...cs]; next[10] = { ...cs[10], z: 301 }; next.push({ hole_id: "NEW", x: 500500, y: 6700000, z: 300, dip: -90, azimuth: 0, depth: 50 });
  const o = keptOrigin(cache, { ox: next.reduce((s, c) => s + c.x, 0) / next.length, oy: 6700000, oz: next.reduce((s, c) => s + c.z, 0) / next.length });
  assert.deepEqual(o, o0);
  const p = planHoles(cache, next, new Map(), "m", { ...o, rebuildSeq: 0 });
  assert.equal(p.full, false);
  assert.deepEqual([...p.changedHoles].sort(), ["H10", "NEW"]);
});

test("the build takes its origin through keptOrigin", () => {
  const v = viewerSource();
  assert.ok(v.includes("const { ox, oy, oz } = keptOrigin(sceneCaches.get(groups), {"));
});
