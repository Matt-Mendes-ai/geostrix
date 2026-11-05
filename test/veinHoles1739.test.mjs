// TASKS.csv #1739 — midpoints from one or two holes always fit a plane, so the vein tool no longer reports such a plane as a
// measured attitude; a logged angle to core axis gives a true thickness to set beside the modelled one
import test from "node:test";
import assert from "node:assert/strict";
import { buildVeinModel } from "../src/lib/vein.js";
import { coreAngleColumn, coreAngleThickness } from "../src/lib/veinCoreAngle.js";

// a vertical hole at (x, y) from z = 1000, an intercept from..to downhole
const icpt = (holeId, x, y, from, to) => ({ holeId, from, to, hw: { x, y, z: 1000 - from }, fw: { x, y, z: 1000 - to } });

test("#1739 six intercepts in one hole plus one 800 m away: no measured attitude", () => {
  const cb = [10, 40, 70, 100, 130, 160].map((d, k) => icpt("A", 0, 0, d, d + 10)).concat([icpt("B", 800, 0, 50, 60)]);
  assert.throws(() => buildVeinModel(cb), (e) => e.attitude === true && /only 2 hole\(s\)/.test(e.message));
  const m = buildVeinModel(cb, { fallbackAttitude: { dip: 60, dipDir: 120, source: "logged" } });
  assert.equal(m.plane.attitudeSource, "logged");
  assert.equal(Math.round(m.plane.dip), 60);
});

test("#1739 holes on one line refuse; three holes off a line fit", () => {
  const line = [icpt("A", 0, 0, 50, 52), icpt("B", 100, 0, 60, 62), icpt("C", 200, 0, 70, 72), icpt("C", 200, 0, 90, 92)];
  assert.throws(() => buildVeinModel(line), (e) => e.attitude === true && /lie along one line/.test(e.message));
  const spread = [icpt("A", 0, 0, 50, 52), icpt("B", 100, 0, 60, 62), icpt("C", 0, 100, 40, 42), icpt("D", 100, 100, 50, 52)];
  const m = buildVeinModel(spread);
  assert.equal(m.plane.attitudeSource, "fitted to intercept midpoints");
});

test("#1739 the logged angle to core axis gives the true thickness", () => {
  const rows = [
    { hole_id: "A", from: 10, to: 20, value: "CB", Vein_pct1: 4, Vein_AvgAngle_TCA1: 30, Vein_AvgAngle_TCA2: 80 },
    { hole_id: "A", from: 40, to: 50, value: "CB", Vein_AvgAngle_TCA1: 90 },
    { hole_id: "A", from: 70, to: 80, value: "QZ", Vein_AvgAngle_TCA1: 45 },
  ];
  assert.equal(coreAngleColumn(rows), "Vein_AvgAngle_TCA1");
  assert.equal(coreAngleColumn([{ hole_id: "A", Alpha: "", alphanumeric: 3 }]), null);
  const r = coreAngleThickness([{ holeId: "A", from: 10, to: 20 }, { holeId: "A", from: 40, to: 50 }, { holeId: "A", from: 70, to: 80 }], "CB", [{ name: "vein", rows: [{ hole_id: "A", from: 10, to: 20, value: "CB" }] }, { name: "Veins", rows }]);
  assert.equal(r.layer, "Veins"); assert.equal(r.n, 2); assert.equal(r.of, 3);
  assert.equal(+r.min.toFixed(2), 5); assert.equal(+r.max.toFixed(2), 10); assert.equal(+r.mean.toFixed(2), 7.5);
  assert.equal(coreAngleThickness([{ holeId: "A", from: 10, to: 20 }], "CB", [{ name: "x", rows: [{ hole_id: "A", from: 10, to: 20 }] }]), null);
});
