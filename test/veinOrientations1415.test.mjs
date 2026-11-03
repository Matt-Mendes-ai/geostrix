// TASKS.csv #1415 — the vein tool takes the oriented-core vein measurements at its intercepts when the midpoints cannot fix
// the attitude, compares them with a fitted plane when they can, and names the one-hole case
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loggedVeinAttitude, VEIN_TYPE_RE } from "../src/lib/veinOrientations.js";
import { buildVeinModel } from "../src/lib/vein.js";

const S = [
  { hole_id: "H1", depth: 121.5, value: "Vein", dip: 60, azimuth: 90 },
  { hole_id: "H1", depth: 125.0, value: "Stringer", dip: 64, azimuth: 96 },
  { hole_id: "H1", depth: 141.0, value: "Veinlet", dip: 58, azimuth: 84 },
  { hole_id: "H1", depth: 130.0, value: "Bedding", dip: 10, azimuth: 200 }, // not vein-like
  { hole_id: "H1", depth: 200.0, value: "Vein", dip: 10, azimuth: 300 }, // far from the intercepts
  { hole_id: "H2", depth: 122.0, value: "Vein", dip: 10, azimuth: 300 }, // another hole
  { hole_id: "H1", depth: 123.0, value: "Vein", dip: null, azimuth: null }, // alpha only, not oriented
];
const I = [{ holeId: "H1", from: 121, to: 122.25 }, { holeId: "H1", from: 123.55, to: 124.76 }, { holeId: "H1", from: 140.12, to: 146 }];

test("only oriented vein-like picks of the same hole, within 2 m of an intercept, are averaged", () => {
  const r = loggedVeinAttitude(I, S);
  assert.equal(r.n, 3);
  assert.equal(r.holes, 1);
  assert.deepEqual(r.types.sort(), ["Stringer", "Vein", "Veinlet"]);
  assert.ok(Math.abs(r.meanDip - 60.7) < 1.5, `dip ${r.meanDip}`);
  assert.ok(Math.abs(r.meanDipDir - 90) < 3, `dip dir ${r.meanDipDir}`);
  assert.ok(r.k > 50 && !r.noPreferred);
  assert.equal(r.tolM, 2);
});

test("the vein's own code counts too; nothing nearby says so", () => {
  assert.equal(loggedVeinAttitude(I, [{ hole_id: "H1", depth: 121.4, value: "CRST", dip: 40, azimuth: 10 }], { veinValue: "crst" }).n, 1);
  assert.equal(loggedVeinAttitude(I, [{ hole_id: "H1", depth: 300, value: "Vein", dip: 40, azimuth: 10 }]).n, 0);
  assert.ok(VEIN_TYPE_RE.test("STWK") && VEIN_TYPE_RE.test("Veinlet") && !VEIN_TYPE_RE.test("Bedding"));
});

// three intercepts down one inclined hole: their midpoints are on one line
const hole = (md) => ({ x: 0.5 * md, y: 0, z: 1000 - 0.866 * md });
const oneHole = I.map((i) => ({ ...i, hw: hole(i.from), fw: hole(i.to) }));

test("one hole: the error says one hole, and is marked as an attitude problem", () => {
  assert.throws(() => buildVeinModel(oneHole), (e) => e.attitude === true && /in one hole/.test(e.message));
});

test("one hole with logged orientations: the vein is built at their mean, and says where it came from", () => {
  const r = loggedVeinAttitude(I, S);
  const m = buildVeinModel(oneHole, { fallbackAttitude: { dip: r.meanDip, dipDir: r.meanDipDir, source: "mean of 3 logged" } });
  assert.equal(m.plane.attitudeSource, "mean of 3 logged");
  assert.ok(Math.abs(m.plane.dip - r.meanDip) < 1e-9);
});

test("a typed attitude still wins over the logs, and a fittable set ignores the fallback", () => {
  assert.equal(buildVeinModel(oneHole, { dip: 45, dipDir: 10, fallbackAttitude: { dip: 60, dipDir: 90, source: "logs" } }).plane.attitudeSource, "user-supplied");
  const spread = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }].map((p, k) => ({ holeId: `H${k}`, from: 100, to: 102, hw: { x: p.x, y: p.y, z: 500 - 0.3 * p.x }, fw: { x: p.x, y: p.y, z: 498 - 0.3 * p.x } }));
  assert.equal(buildVeinModel(spread, { fallbackAttitude: { dip: 10, dipDir: 10, source: "logs" } }).plane.attitudeSource, "fitted to intercept midpoints");
});

test("the vein run reads the logs, compares, and adds the 'none nearby' sentence to an attitude failure", () => {
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /logged = typed \? null : loggedVeinAttitude\(used, layers\.structure, \{ veinValue \}\)/);
  assert.match(src, /fallbackAttitude: \{ dip: logged\.meanDip, dipDir: logged\.meanDipDir, source: fromLogs \}/);
  assert.match(src, /from the plane fitted to the midpoints/);
  assert.match(src, /e\?\.attitude && logged && !logged\.n/);
});
