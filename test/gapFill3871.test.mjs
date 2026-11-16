// TASKS.csv #3871 (Matt, 2026-11-16: "a bunch of steps on the GEM-15 data") — the nodes GEM-15 masks were filled straight from GLO-30, which differs from GEM-15 by metres to tens of
// metres: every gap outline was a cliff. Synthetic terrain: a rolling surface, GLO-30 = that surface (canopy, EGM2008), GEM-15 = bare earth lower by an offset that varies over the area.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillWithDelta, seamJump, deltaField } from "../src/lib/gapFill.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const W = 120, H = 100;
const surface = (x, y) => 1000 + 40 * Math.sin(x / 17) + 25 * Math.cos(y / 13) + 0.3 * x; // ~ 0.3 m per node slope, 40 m waves
const offset = (x, y) => 6 + 14 * (x / W) + 3 * Math.sin(y / 9); // 6..23 m: canopy height + the geoid's metre
function scene(gapOf) {
  const cop = new Float32Array(W * H), gem = new Float32Array(W * H), valid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; cop[i] = surface(x, y);
    valid[i] = gapOf(x, y) ? 0 : 1;
    gem[i] = valid[i] ? surface(x, y) - offset(x, y) : NaN;
  }
  return { cop, gem, valid };
}
// two irregular gaps: a lake-like blob and a long diagonal strip
const gapOf = (x, y) => Math.hypot(x - 35, (y - 40) * 1.4) < 22 || (Math.abs(x - y * 1.2 - 20) < 4 && y > 10) || (x > 85 && x < 112 && y > 55 && y < 90);

test("plain GLO-30 fill: a cliff of the offset at every gap edge; the delta fill brings the seam down to the terrain's own relief", () => {
  const { cop, gem, valid } = scene(gapOf);
  const plain = Float32Array.from(gem); for (let i = 0; i < plain.length; i++) if (!Number.isFinite(plain[i])) plain[i] = cop[i];
  const before = seamJump(plain, valid, W, H);
  const r = fillWithDelta(gem, cop, W, H);
  const after = seamJump(r.out, valid, W, H);
  assert.ok(before.median > 6 && before.max > 18, JSON.stringify(before));            // the offset is a step across the seam
  assert.ok(after.max < 5 && after.median < 1.5, JSON.stringify(after));              // continuous: the terrain's own slope
  assert.ok(after.p90 < 2 * after.ownP90 + 1, `${after.p90} vs the area's own ${after.ownP90}`);
  assert.ok(r.filled > 1000 && r.nValid > 5000);
  console.log("seam jump before", JSON.stringify(before), "after", JSON.stringify(after));
});

test("the fill is GLO-30 plus a smooth offset: inside a gap it stays within the range the valid nodes show, and the valid nodes are untouched", () => {
  const { cop, gem, valid } = scene(gapOf);
  const r = fillWithDelta(gem, cop, W, H);
  for (let i = 0; i < gem.length; i++) if (valid[i]) assert.equal(r.out[i], gem[i]);
  assert.ok(r.delta.min > -26.5 && r.delta.max < -2.5, JSON.stringify(r.delta)); // the offsets ran -3 .. -26 (GEM-15 minus GLO-30)
  // the offset at the middle of the blob is the true offset to within a couple of metres
  const i = 40 * W + 35, truth = -offset(35, 40);
  assert.ok(Math.abs(r.out[i] - cop[i] - truth) < 3, `${r.out[i] - cop[i]} vs ${truth}`);
});

test("no GLO-30 value: the node stays empty; no GEM-15 value at all: the fill is GLO-30 as it was; a gap with no neighbours' offsets still gets one", () => {
  const { cop, gem } = scene(gapOf);
  cop[40 * W + 35] = NaN;
  const r = fillWithDelta(gem, cop, W, H);
  assert.ok(Number.isNaN(r.out[40 * W + 35]));
  const none = new Float32Array(W * H).fill(NaN), r2 = fillWithDelta(none, cop, W, H);
  assert.equal(r2.out[5], cop[5]); assert.equal(r2.nValid, 0);
  const d = deltaField(gem, cop, W, H); assert.ok(d.iterations > 0 && d.iterations <= 80);
});

test("wiring: the GEM-15 terrain fills its gaps with the delta surface and reports the seam", () => {
  const g = read("../src/lib/gem15Dem.js");
  assert.match(g, /fillWithDelta\(out, cop\.elevations, gridW, gridH\)/);
  assert.match(g, /seam/);
});

test("wiring: the import notice says how the gaps were filled and the seam's jump; the fill can be switched to plain for measuring", () => {
  const m = read("../src/modules/GeophysicsModule.jsx"), g = read("../src/lib/gem15Dem.js");
  assert.match(m, /The fill is GLO-30 plus the difference between the two models interpolated in from the nodes GEM-15 has/);
  assert.match(g, /gapFill = "delta"/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))[" The fill is GLO-30 plus the difference between the two models interpolated in from the nodes GEM-15 has, so it meets GEM-15 at the edge: neighbouring nodes across that edge differ by {after} m at the median (GLO-30 alone: {before} m)."], l);
});
