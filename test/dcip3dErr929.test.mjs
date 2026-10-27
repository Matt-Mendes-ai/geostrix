// TASKS.csv #929 — the 3D request carries each line's error column as per-reading floors (as the 2D one does, #683), and
// chargeability goes in only when every line has one value per reading.
import test from "node:test";
import assert from "node:assert/strict";
import { lineIn3d, build3dRequest, linesHaveIp, perReadingFloors } from "../src/lib/dcip3d.js";

const line = (name, y, extra = {}) => ({
  id: name, name,
  readings: [[0, null, 25, 50], [0, null, 50, 75], [25, null, 50, 75], [25, null, 75, 100]],
  rho: [100, 110, 120, 130], ip: [5, 6, 7, 8],
  line: { x0: "1000", y0: String(y), x1: "1100", y1: String(y), scale: "", stations: { file: "gps.txt", line: name, list: [0, 25, 50, 75, 100].map((s) => ({ s, x: 1000 + s, y, z: 900 })) } },
  opts: { pct: "5", floor: "1", ipPct: "5", ipFloor: "1" }, ...extra,
});
const opts = { core: 25, depth: 100, pct: "5", floor: "1", ipPct: "5", ipFloor: "1" };

test("#929: a line whose error column is resistivity % gives its readings floors; the other line's are null", () => {
  const a = lineIn3d(line("A", 5100, { err: [2, "", 3.5, null], opts: { errKind: "rhoPct" } }), null);
  const b = lineIn3d(line("B", 5200, { err: [9, 9, 9, 9] }), null); // an error column the user did not set as either: not used
  assert.equal(a.errKind, "rhoPct");
  const r = build3dRequest([a, b], null, opts);
  assert.deepEqual(r.uncertainty.floorPerReadingPercent, [2, null, 3.5, null, null, null, null, null]);
  assert.equal(r.ipUncertainty.floorPerReadingMvV, undefined);
  // every 2nd current position keeps the floors of the readings it keeps
  const half = build3dRequest([a], null, { ...opts, step: 2 });
  assert.deepEqual(half.uncertainty.floorPerReadingPercent, [2, null]);
});

test("#929: a chargeability error column (mV/V) goes to the IP floors, and only when IP is inverted", () => {
  const a = lineIn3d(line("A", 5100, { err: [1, 2, 3, 4], opts: { errKind: "ipMvV" } }), null);
  const b = lineIn3d(line("B", 5200), null);
  assert.deepEqual(build3dRequest([a, b], null, opts).ipUncertainty.floorPerReadingMvV, [1, 2, 3, 4, null, null, null, null]);
  const noIp = lineIn3d(line("C", 5300, { ip: null }), null);
  const r = build3dRequest([a, noIp], null, opts);
  assert.equal(r.chargeability, undefined); assert.equal(r.ipUncertainty, undefined);
  assert.equal(perReadingFloors([b], "rhoPct"), null);
});

test("#929: IP needs one value per reading on every line (the panel and the request use the same rule)", () => {
  const ok = lineIn3d(line("A", 5100), null), short = lineIn3d(line("B", 5200, { ip: [5, 6] }), null);
  assert.equal(linesHaveIp([ok]), true);
  assert.equal(linesHaveIp([ok, short]), false);
  assert.equal(build3dRequest([ok, short], null, opts).chargeability, undefined);
});
