// TASKS.csv #3034 / #3036 / #2987 (review #2876, WA iron) — Terrain from the project's samples and collars: every collar gets ground (a collar on
// the edge of its patch or on a drill line had a corner node outside every triangle: 2,618 / 1,437 / 1,071 with no ground at 200 / 513 /
// 1,025 nodes), the grid follows the points' spacing, and collars with an assumed or suspect elevation are left out and named.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainFromPoints, SPACING_FIT_MAX_NODES } from "../src/lib/terrainFromPoints.js";
import { terrainGroundAt } from "../src/lib/viewer/geomath.js";
import { suspectElevationIds, elevationTrust } from "../src/lib/collarElevationTrust.js";

let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const zAt = (x, y) => 430 + 10 * Math.sin(x / 3000) + 8 * Math.cos(y / 2000);
function field() {
  const pts = [];
  for (let p = 0; p < 12; p++) { const cx = 1000 + (p % 4) * 7000, cy = 1000 + Math.floor(p / 4) * 4000, n = 4 + (p % 5); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push({ x: cx + 40 * i, y: cy + 40 * j, z: zAt(cx + 40 * i, cy + 40 * j) }); }
  for (let l = 0; l < 6; l++) { const cx = 3000 + l * 4000, cy = 3000 + (l % 3) * 2500, a = l * 0.5; for (let i = 0; i < 15; i++) { const x = cx + 50 * i * Math.cos(a), y = cy + 50 * i * Math.sin(a); pts.push({ x, y, z: zAt(x, y) }); } }
  for (let k = 0; k < 10; k++) { const x = 500 + rnd() * 29000, y = 500 + rnd() * 11000; pts.push({ x, y, z: zAt(x, y) }); }
  return pts;
}
const noGround = (t, pts) => pts.filter((p) => !Number.isFinite(terrainGroundAt(t, p.x, p.y))).length;

test("#3034 — every point has ground at every detail: patches smaller than a node spacing, drill lines and lone holes", () => {
  const pts = field();
  for (const gridMax of [200, 513, 1025]) {
    const t = terrainFromPoints({ points: pts }, { gridMax });
    assert.equal(noGround(t, pts), 0, `detail ${gridMax}`);
    assert.ok(t.stats.pointNodes > 0);
  }
});

test("#3034 — the ground beside a point is the points' own elevation, and none is invented between patches", () => {
  const pts = field();
  const t = terrainFromPoints({ points: pts }, { gridMax: 200 });
  for (const p of pts) assert.ok(Math.abs(terrainGroundAt(t, p.x, p.y) - p.z) < 6, "within the local relief of a node spacing");
  // the middle of the widest gap between patches stays no-data (the long-edge cut-off), as before
  const lone = terrainFromPoints({ points: [...pts.slice(0, 16), ...pts.slice(0, 16).map((p) => ({ ...p, x: p.x + 20000 })), { x: 11000, y: 9000, z: 420 }] }, { gridMax: 200 });
  assert.ok(!Number.isFinite(terrainGroundAt(lone, 6000, 1060)), "no ground across a 20 km gap");
});

test("#3036 — the grid follows the points' spacing, never coarser than the detail chosen nor finer than the cap; contours keep the detail", () => {
  const pts = field();
  const fixed = terrainFromPoints({ points: pts }, { gridMax: 200 });
  assert.equal(Math.max(fixed.gridW, fixed.gridH), 200);
  const fit = terrainFromPoints({ points: pts }, { gridMax: 200, spacingFit: true });
  assert.equal(fit.stats.spacingM, 40);
  assert.equal(fit.stats.gridFromSpacing, true);
  assert.equal(Math.max(fit.gridW, fit.gridH), Math.min(SPACING_FIT_MAX_NODES, Math.ceil(Math.max(fit.bbox[2] - fit.bbox[0], fit.bbox[3] - fit.bbox[1]) / 40) + 1));
  assert.equal(SPACING_FIT_MAX_NODES, 1025);
  // a small, coarse set: the chosen detail already beats its spacing
  const sparse = [[0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 500]].map(([x, y]) => ({ x, y, z: 100 }));
  const s = terrainFromPoints({ points: sparse }, { gridMax: 200, spacingFit: true });
  assert.equal(s.gridW, 200);
  assert.equal(s.stats.gridFromSpacing, false);
  // contour lines: no spacing fit (they are densified to the grid)
  const line = (z, y) => Array.from({ length: 50 }, (_, i) => ({ x: i * 200, y, z }));
  const c = terrainFromPoints({ lines: [line(100, 0), line(110, 300), line(120, 600)] }, { gridMax: 200, spacingFit: true });
  assert.equal(c.gridW, 200);
  assert.equal(c.stats.spacingM, null);
});

test("#2987 — the shared rule: an import-filled elevation is 'assumed', a 0 m collar on a 440 m plateau 'suspect', the rest measured", () => {
  const collars = Array.from({ length: 20 }, (_, i) => ({ hole_id: `H${i}`, x: i * 50, y: 0, z: 440 + (i % 5) }));
  collars.push({ hole_id: "A1", x: 1100, y: 0, z: 438.8, zAssumed: "median" }, { hole_id: "Z1", x: 1150, y: 0, z: 0 });
  const sus = suspectElevationIds(collars);
  assert.deepEqual(collars.map((c) => elevationTrust(c, sus)).filter((t) => t !== "measured"), ["assumed", "suspect"]);
});

test("#2987 / #3034 / #3036 — Geophysics' terrain from the project uses measured collars only, names the rest, fits the spacing and says what it did", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const measured = \(collars \|\| \[\]\)\.filter\(\(c\) => trustOf\(c\) === "measured"\);/);
  assert.match(src, /c = pick\(measured\)/);
  assert.match(src, /tr\("\{n\} collar\(s\) are left out: \{a\} with an elevation the import filled in, \{s\} with one that looks like a missing value \(\{ids\}\)\."/);
  assert.match(src, /leftOutNote: collarsOutNote\(projectZPoints\.collarsOut\), spacingFit: true \}\)/);
  assert.match(src, /terrainFromPointsAsync\(\{ points, lines \}, \{ gridMax: terrainDetail, spacingFit \}\)/);
  assert.match(src, /if \(t\.stats\.pointNodes\) msg \+=/);
  assert.match(src, /if \(t\.stats\.gridFromSpacing\) msg \+=/);
  assert.match(src, /\{projectZPoints\.collarsOut\.length > 0 && <div/, "said under the button, before it is pressed");
});
