// TASKS.csv #3766 (Scottie Gold review) — the Implicit run's fallback orientation is the plane of least spread of the contact points, not a regression of
// elevation on easting / northing (which gave 39° where the contacts lie on a plane dipping 74°). Synthetic points.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateOrientationFromPoints } from "../src/lib/viewer/contactOrientation.js";
import { trendBasis } from "../src/lib/trend.js";

// the old fit, kept here only to show what it did
function oldEstimate(points) {
  const n = points.length; let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, Sxz = 0, Syz = 0, Sz = 0;
  for (const p of points) { Sxx += p.x * p.x; Sxy += p.x * p.y; Sx += p.x; Syy += p.y * p.y; Sy += p.y; Sxz += p.x * p.z; Syz += p.y * p.z; Sz += p.z; }
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3([[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]]);
  const a = det3([[Sxz, Sxy, Sx], [Syz, Syy, Sy], [Sz, Sy, n]]) / D, b = det3([[Sxx, Sxz, Sx], [Sxy, Syz, Sy], [Sx, Sz, n]]) / D;
  return Math.acos(1 / Math.sqrt(a * a + b * b + 1)) * 180 / Math.PI;
}

// points scattered over a plane dipping 75° towards 110° (a steep unit seen along fans of holes: wide in the strike direction, ±20 m thick across it)
const B = trendBasis({ dip: 75, dipAzimuth: 110, pitch: 0 });
let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
const pts = Array.from({ length: 138 }, () => { const a = r() * 300, b = r() * 120, c = r() * 40; return { x: 1000 + a * B.major.x + b * B.semiMajor.x + c * B.minor.x, y: 2000 + a * B.major.y + b * B.semiMajor.y + c * B.minor.y, z: 300 + a * B.major.z + b * B.semiMajor.z + c * B.minor.z }; });

test("a steep unit's contacts give a steep orientation, with the dip direction", () => {
  const e = estimateOrientationFromPoints(pts);
  assert.equal(e.fit, "plane");
  assert.ok(Math.abs(e.dip - 75) < 2, `dip ${e.dip}`);
  assert.ok(Math.abs(e.azimuth - 110) < 3, `azimuth ${e.azimuth}`);
  assert.ok(Math.abs(e.x - 1000) < 60 && Math.abs(e.z - 300) < 60, "at the centroid");
  assert.ok(oldEstimate(pts) < 60, `the old fit flattened it: ${oldEstimate(pts)}`);
});

test("a gently dipping contact still comes out gentle; the upward normal fixes the polarity", () => {
  const G = trendBasis({ dip: 20, dipAzimuth: 300, pitch: 0 });
  const gentle = Array.from({ length: 60 }, () => { const a = r() * 400, b = r() * 400, c = r() * 2; return { x: a * G.major.x + b * G.semiMajor.x + c * G.minor.x, y: a * G.major.y + b * G.semiMajor.y + c * G.minor.y, z: a * G.major.z + b * G.semiMajor.z + c * G.minor.z }; });
  const e = estimateOrientationFromPoints(gentle);
  assert.ok(Math.abs(e.dip - 20) < 1.5 && Math.abs(e.azimuth - 300) < 4, JSON.stringify(e));
  assert.ok(Math.abs(oldEstimate(gentle) - e.dip) < 3, "where the old fit was right, the two agree");
});

test("too few points or one line: flat at the centroid, as before; three points give their plane", () => {
  assert.deepEqual([estimateOrientationFromPoints([{ x: 1, y: 2, z: 3 }, { x: 2, y: 2, z: 3 }]).dip, estimateOrientationFromPoints([]).fit], [0, "flat"]);
  const line = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 2 * i, z: -i }));
  assert.equal(estimateOrientationFromPoints(line).fit, "flat");
  const tri = estimateOrientationFromPoints([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 10, z: -10 }]); // dips 45° towards the north (z falls with y)
  assert.ok(Math.abs(tri.dip - 45) < 0.5 && Math.abs(tri.azimuth - 0) < 1, JSON.stringify(tri));
});

test("wiring: modellingRuns reads it, ViewerModule no longer carries the regression, the notice compares with the geology trend", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /import \{ estimateOrientationFromPoints \} from "\.\.\/\.\.\/lib\/viewer\/contactOrientation\.js";/);
  assert.match(m, /the assigned geology trend \\"\{name\}\\" dips \{tdip\}° towards \{taz\}°/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(v, /estimateOrientationFromPoints/);
  assert.doesNotMatch(v, /Cramer's rule/);
});

// TASKS.csv #3780 (#3766) — an assigned geology trend's plane is the Implicit run's orientation, in place of the contacts' own plane
test("#3780 the assigned trend's plane is the orientation, the contacts' plane said beside it", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const gtAssigned = est\.fit === "plane" \? trendWarp\("implicit"\) : null;/);
  assert.match(m, /orientations = \[usesTrend \? \{ \.\.\.est, dip: gtAssigned\.trend\.dip, azimuth: gtAssigned\.trend\.dipAzimuth, fit: "assigned trend" \} : est\];/);
  assert.match(m, /The run uses the assigned trend's plane as the orientation\./);
});
