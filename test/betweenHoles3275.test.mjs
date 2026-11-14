// TASKS.csv #3275 (Galore Creek review) — 'Interpolated' depended on how closely a hole is sampled: 2 % of the copper blocks but 24 % of the
// specific-gravity blocks on the same holes and lattice (16 samples at 8 a hole are two 16 m runs of core). The class is now 'between holes':
// the sample points within the search, from at least two holes, lie on both sides of the block along x, y and z. A block between holes whose
// samples used do not surround it is counted apart (oneSided), and the sentence says what is checked.
import test from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel, makeSupportClassifier, summarizeSupport, SUPPORT_INTERPOLATED, SUPPORT_EXTRAPOLATED } from "../src/lib/estimation.js";

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const holes = [];
for (let h = 0; h < 6; h++) holes.push({ id: `H${h}`, x0: (h % 3) * 200 + rnd() * 40, y0: Math.floor(h / 3) * 200 + rnd() * 40, dip: 60 + rnd() * 25, az: rnd() * 360, len: 200 + rnd() * 50 }); // six holes about 200 m apart
const along = (H, md) => { const r = md * Math.cos((H.dip * Math.PI) / 180); return { x: H.x0 + r * Math.sin((H.az * Math.PI) / 180), y: H.y0 + r * Math.cos((H.az * Math.PI) / 180), z: 500 - md * Math.sin((H.dip * Math.PI) / 180) }; };
const cu = [], sg = [];
for (const H of holes) {
  for (let md = 1; md < H.len; md += 2) cu.push({ ...along(H, md), value: 3000 + 2000 * Math.sin(md / 40), hole_id: H.id, length: 2 });
  for (let k = 0; k < 11; k++) sg.push({ ...along(H, 5 + (k * (H.len - 10)) / 10), value: 2.7, hole_id: H.id, length: 0.11 });
}
// 25 m cells (the review's lattice; at 50 m half a cell swamps the sample spacing and both samplings agree anyway), over the whole drilling
const opts = { bounds: { xmin: -100, xmax: 650, ymin: -100, ymax: 500, zmin: 250, zmax: 520 }, cellSize: { dx: 25, dy: 25, dz: 25 }, method: "idw2", searchRadius: 300, minSamples: 1, maxSamples: 16, minHoles: 2, maxPerHole: 8, support: true, maxBlocks: 400000 };
const share = (r) => r.supportCounts.interpolated / (r.supportCounts.interpolated + r.supportCounts.extrapolated);

test("the same holes give the same 'between holes' share whatever the sampling (2 m composites against short pieces)", () => {
  const a = estimateBlockModel(cu, opts), b = estimateBlockModel(sg, opts);
  // the class before #3275 (holeBracket: false) is the review's: far apart for the two samplings
  const a0 = estimateBlockModel(cu, { ...opts, holeBracket: false }), b0 = estimateBlockModel(sg, { ...opts, holeBracket: false });
  assert.ok(share(b0) - share(a0) > 0.05 && share(a0) < 0.05, `before: Cu ${share(a0)} SG ${share(b0)}`); // 2 % against 11 % on this set
  assert.ok(Math.abs(share(a) - share(b)) < 0.03, `now: Cu ${share(a)} SG ${share(b)}`); // both 17 %
  assert.ok(share(a) > share(a0) + 0.1);
  // the estimate itself is untouched: the same values block for block
  assert.deepEqual(a.cells.map((c) => c.value), a0.cells.map((c) => c.value));
  // the copper blocks between holes whose 16 samples do not surround them are said apart
  assert.ok(a.supportCounts.oneSided > 0 && a.supportCounts.oneSided <= a.supportCounts.interpolated);
  assert.equal(a.supportCounts.searchLimited, 0);
  const s = summarizeSupport(a.supportCounts);
  assert.match(s, /Of the interpolated cells \(between holes: the holes within the search surround them\), [\d,]+ were estimated from samples that do not surround them/);
  assert.ok(!/DO have data surrounding them/.test(s));
});

test("one hole never brackets; a block beyond the drilling is extrapolated; a domain rule reads only its own domain", () => {
  const one = cu.filter((p) => p.hole_id === "H0");
  const r1 = estimateBlockModel(one, { ...opts, minHoles: 1 });
  assert.equal(r1.supportCounts.interpolated, 0);
  // two vertical holes 200 m apart in x: a block between them at mid-depth is between holes on x and z, not on y (they are in line)
  const vh = (id, x, y) => Array.from({ length: 100 }, (_, k) => ({ x, y, z: 500 - k * 2, value: 1, hole_id: id, length: 2 }));
  const two = [...vh("A", 0, 0), ...vh("B", 200, 0)];
  const cls = makeSupportClassifier(two, { searchRadius: 300, maxSamples: 16, bracketTol: 5 });
  assert.equal(cls(100, 0, 400).cls, SUPPORT_EXTRAPOLATED);
  const four = [...two, ...vh("C", 100, -150), ...vh("D", 100, 150)];
  const cls4 = makeSupportClassifier(four, { searchRadius: 300, maxSamples: 16, bracketTol: 5 });
  assert.equal(cls4(100, 0, 400).cls, SUPPORT_INTERPOLATED);
  assert.equal(cls4(400, 0, 400).cls, SUPPORT_EXTRAPOLATED); // east of every hole
  assert.equal(cls4(100, 0, 600).cls, SUPPORT_EXTRAPOLATED); // above every collar
  // the same four holes, with C and D in another domain: for a block of A / B's domain they do not count
  const dom = four.map((p) => ({ ...p, domain: p.hole_id === "C" || p.hole_id === "D" ? "west" : "east" }));
  const clsD = makeSupportClassifier(dom, { searchRadius: 300, maxSamples: 16, bracketTol: 5, restrictToDomain: true });
  assert.equal(clsD(100, -5, 400).cls, SUPPORT_EXTRAPOLATED);
});

test("holeBracket: false keeps the samples-used class", () => {
  const vh = (id, x, y) => Array.from({ length: 100 }, (_, k) => ({ x, y, z: 500 - k * 2, value: 1, hole_id: id, length: 2 }));
  const four = [...vh("A", 0, 0), ...vh("B", 200, 0), ...vh("C", 100, -150), ...vh("D", 100, 150)];
  // 16 samples, at most 4 a hole: enough to surround the middle block; 2 samples a block: not
  const tight = makeSupportClassifier(four, { searchRadius: 300, maxSamples: 2, bracketTol: 5, holeBracket: false });
  assert.equal(tight(100, 0, 400).cls, SUPPORT_EXTRAPOLATED);
  const now = makeSupportClassifier(four, { searchRadius: 300, maxSamples: 2, bracketTol: 5 });
  assert.equal(now(100, 0, 400).cls, SUPPORT_INTERPOLATED);
  assert.equal(now(100, 0, 400).oneSided, true);
});
