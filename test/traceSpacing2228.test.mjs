// TASKS.csv #2228 (review #2174, WA gold) — auto cell and search from the hole spacing along the traces when the collars cluster in fans
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { traceSpacing, autoHaloParams, medianCollarSpacing } from "../src/lib/viewer/geomath.js";

// a trace: md every 5 m, world coordinates down a straight line from (x0, y0, z0) towards (dx, dy, dz) per metre
const trace = (hole_id, x0, y0, z0, dx, dy, dz, len = 300) => {
  const pts = [], wx = [], wy = [], wz = [];
  for (let md = 0; md <= len; md += 5) { pts.push({ md }); wx.push(x0 + dx * md); wy.push(y0 + dy * md); wz.push(z0 + dz * md); }
  return { hole_id, pts, wx, wy, wz };
};
// two sites 200 m apart, a fan of 4 holes from each: collars 0.5 m apart, the holes spread at depth
const fans = [];
const collars = [];
[[0, 0], [200, 0]].forEach(([sx, sy], s) => [-0.6, -0.2, 0.2, 0.6].forEach((dir, k) => {
  const id = `S${s}H${k}`; collars.push({ hole_id: id, x: sx + k * 0.5, y: sy }); fans.push(trace(id, sx + k * 0.5, sy, 400, dir, 0.3, -0.75));
}));

test("the fan's collars are under a metre apart; along the traces the holes are tens of metres apart", () => {
  assert.equal(medianCollarSpacing(collars), 0.5);
  const t = traceSpacing(fans);
  assert.ok(t > 15 && t < 120, String(t));
});

test("auto halo parameters: from the traces when the collars cluster, said; from the collars otherwise", () => {
  const a = autoHaloParams(collars, fans);
  assert.equal(a.fromTraces, true); assert.equal(a.collarSpacing, 0.5);
  assert.ok(a.radius > 15 && a.spacing > 15, JSON.stringify(a));
  const spread = [0, 1, 2, 3].map((k) => ({ hole_id: `G${k}`, x: k * 100, y: 0 }));
  const gTraces = spread.map((c) => trace(c.hole_id, c.x, c.y, 400, 0, 0, -1));
  const b = autoHaloParams(spread, gTraces);
  assert.equal(b.fromTraces, undefined); assert.equal(b.spacing, 100);
  assert.deepEqual(autoHaloParams(spread), { radius: 120, cell: 15, spacing: 100 }); // no traces: as before
});

test("the run passes the traces and says where the auto values came from", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /autoHaloParams\(collars\.filter\(\(c\) => loggedHoles\.has\(c\.hole_id\)\), tracesRef\.current \|\| null\)/);
  assert.match(r, /Auto cell and search from the hole spacing along the traces/);
});
