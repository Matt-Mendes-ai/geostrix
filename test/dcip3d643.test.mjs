// TASKS.csv #643 — the 3D DC/IP request from saved lines: electrodes placed in 3D from each line's placement and ground,
// along-line distances kept for the flat geometric factor, the cheaper "every 2nd current position" preset, IP only when
// every line has it, and the result's cells filtered by support and size
import test from "node:test";
import assert from "node:assert/strict";
import { lineIn3d, suggest3d, build3dRequest, cells3d } from "../src/lib/dcip3d.js";

// a pole-dipole line due east from (1000, 5000): electrodes every 25 m, stations with elevations falling 1 m per 25 m
const line = (name, y, extra = {}) => ({
  id: name, name,
  readings: [[0, null, 25, 50], [0, null, 50, 75], [25, null, 50, 75], [25, null, 75, 100], [50, null, 75, 100]],
  rho: [100, 110, 120, 130, 140], ip: [5, 6, 7, 8, 9],
  line: { x0: "1000", y0: String(y), x1: "1100", y1: String(y), scale: "", stations: { file: "gps.txt", line: name, list: [0, 25, 50, 75, 100].map((s) => ({ s, x: 1000 + s, y, z: 900 - s / 25 })) } },
  opts: { pct: "5", floor: "1", ipPct: "5", ipFloor: "1" }, ...extra,
});

test("#643 a saved line in 3D: x, y on the line, z from the station elevations, poles empty, chain kept", () => {
  const l = lineIn3d(line("100N", 5100), null);
  assert.ok(l.ok);
  assert.deepEqual(l.readings[0], [1000, 5100, 900, null, null, null, 1025, 5100, 899, 1050, 5100, 898]);
  assert.deepEqual(l.chain[1], [0, null, 50, 75]);
  assert.equal(l.spacing, 25);
  assert.equal(l.stations.length, 5);
  assert.equal(lineIn3d({ ...line("x", 0), line: { x0: "" } }, null).reason, "not placed");
  const noGround = line("y", 0); noGround.line.stations = null;
  assert.match(lineIn3d(noGround, null).reason, /no ground/);
  noGround.line.ground = "750";
  assert.equal(lineIn3d(noGround, null).readings[0][2], 750, "the line's entered flat ground");
});

test("#643 the request: lines together, every 2nd current position, IP only when every line has it", () => {
  const a = lineIn3d(line("100N", 5100), null), b = lineIn3d(line("200N", 5200), null);
  const s = suggest3d([a, b]);
  assert.equal(s.core, 25);
  const r = build3dRequest([a, b], null, { core: 25, depth: 100, pct: "5", floor: "1", ipPct: "5", ipFloor: "1" });
  assert.equal(r.readings.length, 10); assert.equal(r.chain.length, 10); assert.equal(r.rho.length, 10);
  assert.equal(r.chargeability.length, 10); assert.deepEqual(r.ipUncertainty, { percent: 5, floor: 1 });
  assert.deepEqual(r.mesh, { core: 25, depth: 100 }); assert.equal(r.geometricFactor, "flat");
  assert.equal(r.topo.length, 10, "the stations of both lines (no terrain)");
  const half = build3dRequest([a, b], null, { core: 25, depth: 100, step: 2, pct: 5 });
  // current positions per line: A = 0, 25, 50 -> every 2nd keeps A = 0 and 50: readings 0, 1 and 4 of each line
  assert.equal(half.rho.length, 6);
  assert.deepEqual(half.rho.slice(0, 3), [100, 110, 140]);
  const noIp = build3dRequest([a, lineIn3d(line("300N", 5300, { ip: null }), null)], null, { core: 25, depth: 100, pct: 5 });
  assert.equal(noIp.chargeability, undefined); assert.equal(noIp.ipUncertainty, undefined);
});

test("#643 terrain: the ground under a line without stations, and samples under the survey for the ground surface", () => {
  const terrain = { bbox: [0, 0, 3000, 8000], gridW: 3, gridH: 3, elevations: [800, 800, 800, 800, 800, 800, 800, 800, 800] };
  const bare = line("100N", 5100); bare.line.stations = null;
  const l = lineIn3d(bare, terrain);
  assert.equal(l.readings[0][2], 800);
  const r = build3dRequest([l], terrain, { core: 25, depth: 100, pct: 5 });
  assert.equal(r.topo.length, 41 * 41, "a 41 x 41 grid over the electrodes plus 500 m");
  assert.ok(r.topo.every((p) => p[2] === 800));
});

test("#643 result cells: the support cutoff and the padding cells left out", () => {
  const result = { cells: { x: [1, 2, 3], y: [1, 2, 3], z: [0, 0, 0], dx: [25, 25, 400], dy: [25, 25, 400], dz: [12.5, 12.5, 200], resistivity: [10, 20, 30], support: [0.5, 0.001, 0.5] } };
  assert.deepEqual(cells3d(result, "resistivity", { cutoff: 0.005, maxCell: 50 }).map((c) => c.value), [10]);
  assert.equal(cells3d(result, "resistivity", { cutoff: 0 }).length, 3);
  assert.deepEqual(cells3d(result, "chargeability"), []);
});
