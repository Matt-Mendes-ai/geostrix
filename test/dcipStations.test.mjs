// TASKS.csv #602 — DC/IP line stations: GPS / station files, line fit, chaining scale, ground profile.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStationFile, matchStationLine, fitStationLine, stationGroundProfile } from "../src/lib/dcipStations.js";
import { lineGeometry } from "../src/lib/dcip.js";

const GPSU = `H  SOFTWARE NAME & VERSION
I  GPSU 5.51 01 REGISTERED to 'Freeware'
H R DATUM
M E               WGS 84 100  0.0000000E+00  0.0000000E+00 0 0 0
H  COORDINATE SYSTEM
U  UTM UPS
F ID----------- Zne Eastng  Northng  Symbol--- T O Alt(m) Comment
W Infinite      10U 609391  5784559  Waypoint  I E 1029.8
W 8575E 750N    10U 608587  5786735  Waypoint  I E 1002.9
W 8575E 800N    10U 608561  5786781  Waypoint  I E 1000.2
W 8575E 850N    10U 608543  5786820  Waypoint  I E 999.0
W 8650E 750N    10U 608650  5786770  Waypoint  I E 1010.0
W 8650E 800N    10U 608625  5786813  Waypoint  I E 1008.0
`;

test("#602 GPS Utility waypoints: '<line> <station>' names, zone + WGS 84 -> EPSG, the pole set aside", () => {
  const r = parseStationFile(GPSU);
  assert.deepEqual(Object.keys(r.lines).sort(), ["8575E", "8650E"]);
  assert.deepEqual(r.lines["8575E"].map((p) => [p.s, p.z]), [[750, 1002.9], [800, 1000.2], [850, 999]]);
  assert.equal(r.epsg, 32610);
  assert.deepEqual(r.other.map((o) => o.name), ["Infinite"]);
});

test("#602 station tables (contractor .dat with GRID_X / GRID_Y), S / W stations negative", () => {
  const r = parseStationFile("   LINE      STN     GRID_X      GRID_Y    MX    RHO\n  8575E   825.00  608552.00  5786800.50  3.56   96.1\n  8575E   925.00  608500.50  5786885.00  3.39   93.4\n");
  assert.equal(r.lines["8575E"].length, 2); assert.equal(r.lines["8575E"][0].z, null);
  const c = parseStationFile("station,x,y,elev\n100S,0,-100,5\n0N,0,0,6\n");
  assert.deepEqual(c.lines[""].map((p) => p.s), [-100, 0]);
  assert.throws(() => parseStationFile("nothing here\n1 2\n", "x.txt"), /no line stations/);
});

test("#602 the line is matched by the DC/IP file's name", () => {
  assert.equal(matchStationLine(["8575E", "8650E", "9000E"], "8575E", "8575E"), "8575E");
  assert.equal(matchStationLine(["A"], "zzz"), "A");
  assert.equal(matchStationLine(["8575E", "8650E"], "line7"), null);
});

test("#602 fit: direction, start at distance 0, chaining scale; the scaled geometry hits the stations", () => {
  // stations every 100 file-metres, but only 98.5 m apart on the ground, azimuth 330
  const az = (330 * Math.PI) / 180, u = [Math.sin(az), Math.cos(az)];
  const st = [750, 850, 950, 1050, 2150].map((s) => ({ s, x: 1000 + u[0] * s * 0.985, y: 5000 + u[1] * s * 0.985, z: 1000 - s / 100 }));
  const f = fitStationLine(st);
  assert.ok(Math.abs(f.scale - 0.985) < 1e-9); assert.ok(Math.abs(f.azimuth - 330) < 1e-6); assert.ok(f.maxAcross < 1e-6);
  const g = lineGeometry(f.start, f.end, f.scale);
  for (const p of st) { const [x, y] = g.at(p.s); assert.ok(Math.hypot(x - p.x, y - p.y) < 1e-6); }
  assert.ok(f.maxResidual < 1e-6);
  const g1 = lineGeometry(f.start, f.end); // without the scale the far station is (1 - 0.985) x 2150 m off
  assert.ok(Math.abs(Math.hypot(g1.at(2150)[0] - st[4].x, g1.at(2150)[1] - st[4].y) - 0.015 * 2150) < 1e-6);
  assert.equal(fitStationLine([st[0]]), null);
});

test("#602 ground profile from station elevations, flat beyond them", () => {
  const p = stationGroundProfile([{ s: 750, z: 1002.9 }, { s: 800, z: 1000.2 }, { s: 900, z: null }], 0, 2000);
  assert.deepEqual(p, [[0, 1002.9], [750, 1002.9], [800, 1000.2], [2000, 1000.2]]);
  assert.equal(stationGroundProfile([{ s: 1, z: 5 }], 0, 2), null);
});
