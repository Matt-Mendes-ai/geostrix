// TASKS.csv #3503 / #3504 / #3505 (from #3353) — Maps > A layer says how far the layer's middle moved; the fetch-area picker says the node spacing beside the area;
// the Maps plan writes the index contours' levels and says how many hole ids were left out. SYNTHETIC layers.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { layerCentre, distanceM, eastNorth, distanceText } from "../src/lib/layerCentre.js";
import { drawCallouts } from "../src/lib/collarCallouts.js";
import { contourLabelSpots } from "../src/lib/contourLabels.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the middle of a layer, by kind", () => {
  const st = {
    collars: [{ x: 100, y: 200 }, { x: 300, y: 600 }],
    plannedHoles: [{ x: 0, y: 0 }, { x: 10, y: 20 }],
    surfaceSamples: [{ x: 5, y: 5 }, { x: 15, y: 25 }, { x: "x", y: 3 }],
    layers: { geophys_pts: [{ x: 0, y: 0, _src: "a" }, { x: 100, y: 50, _src: "a" }, { x: 9000, y: 9000, _src: "b" }] },
    rasters: [{ id: "r1", bbox: [0, 0, 1000, 400] }],
    terrain: { bbox: [10, 10, 30, 50] },
    mapLayers: [{ id: "m1", bbox: [100, 100, 300, 500] }],
    boundaries: [{ id: "b1", polylines: [[{ x: 0, y: 0 }, { x: 40, y: 10 }], [{ x: 20, y: 80 }]] }],
  };
  assert.deepEqual(layerCentre("drillholes", null, st), { x: 200, y: 400 });
  assert.deepEqual(layerCentre("plannedHoles", null, st), { x: 5, y: 10 });
  assert.deepEqual(layerCentre("surfaceSamples", null, st), { x: 10, y: 15 }, "a row with no number is left out");
  assert.deepEqual(layerCentre("survey", "a", st), { x: 50, y: 25 }, "only that survey's points");
  assert.deepEqual(layerCentre("rasters", "r1", st), { x: 500, y: 200 });
  assert.deepEqual(layerCentre("terrain", null, st), { x: 20, y: 30 });
  assert.deepEqual(layerCentre("mapLayers", "m1", st), { x: 200, y: 300 });
  assert.deepEqual(layerCentre("boundaries", "b1", st), { x: 20, y: 40 });
  assert.equal(layerCentre("voxelModels", "v", st), null, "a kind with no x / y: no sentence");
  assert.equal(layerCentre("rasters", "nope", st), null);
  assert.equal(layerCentre("drillholes", null, {}), null);
});

test("the sentence's pieces: grid numbers and the distance in the unit it reads best in", () => {
  assert.equal(eastNorth({ x: 500000.4, y: 6000000.6 }), "E 500,000 N 6,000,001");
  assert.equal(distanceM({ x: 0, y: 0 }, { x: 300, y: 400 }), 500);
  assert.equal(distanceText(500), "500 m");
  assert.equal(distanceText(1234), "1.23 km");
  assert.equal(distanceText(612345), "612.3 km");
  assert.equal(distanceM(null, { x: 1, y: 1 }), null);
});

test("#3503 wired: the middle before, the same transform after, said in the message", () => {
  const c = read("../src/modules/CartographyModule.jsx");
  assert.match(c, /const before = layerCentre\(obj\.kind, obj\.id, store\);/);
  assert.match(c, /mineToProject\(mg, project\.epsg\)\(before\.x, before\.y\)/);
  assert.match(c, /pointTransform\(Number\(objFrom\), project\.epsg\)\?\.\(before\.x, before\.y\)/);
  assert.match(c, /tr\("Its middle moved from \{from\} to \{to\}: \{d\}\.", \{ from: eastNorth\(before\), to: eastNorth\(after\), d: distanceText\(distanceM\(before, after\)\) \}\)/);
  assert.match(c, /\) \+ movedNote \+ \(dn \?/);
});

test("#3504: the fetch-area picker says the node spacing at the chosen detail, with the level's own name", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const TERRAIN_DETAIL_NAMES = \{ 200: "Standard", 513: "High", 1025: "Very high", 2049: "Full" \};/);
  assert.match(g, /tr\("nodes ~\{n\} m apart at \{level\}", \{ n: p\.nodeM < 10 \? p\.nodeM\.toFixed\(1\) : Math\.round\(p\.nodeM\)\.toLocaleString\(\), level: tr\(TERRAIN_DETAIL_NAMES\[terrainDetail\] \|\| "Standard"\) \}\)/);
  // 44 km of ground over 200 nodes: 44,000 / 199 = 221 m, the row's own example
  assert.equal(Math.round(44000 / 199), 221);
});

test("#3505: drawCallouts reports how many labels it left out; the plan says so and writes the contour levels", () => {
  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 6 }) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
  // 40 holes 3 px apart: their ids cannot all be written
  const rows = Array.from({ length: 40 }, (_, i) => ({ hole_id: `HOLE-${i}`, x: i * 3, y: 0 }));
  let got = null;
  const r = drawCallouts(ctx, rows, (x) => 20 + x, (y) => 50 - y, { w: 300, h: 100 }, { dotR: 2, mPerPx: 1, report: (o) => { got = o; } });
  assert.equal(got, r, "the report is the return value");
  assert.ok(r.leftOut > 0 && r.leftOut < 40, `${r.leftOut} of the 40 holes' ids left out`);
  const none = drawCallouts(ctx, [{ hole_id: "A", x: 0, y: 0 }], (x) => 100 + x, (y) => 50 - y, { w: 300, h: 100 }, { dotR: 2, mPerPx: 1 });
  assert.equal(none.leftOut, 0);
  const p = read("../src/components/MapsPlanView.jsx");
  assert.match(p, /report: \(r\) => setIdsLeftOut\(r\.leftOut\), fontPx: labelPx\("xs"\) \/\* #3900 \*\/ \}\);/); // #3900 T2: the callouts' size on screen
  assert.match(p, /\{showIds && idsLeftOut > 0 && <span[^>]*> \{tr\("\(\{n\} left out: they overlap, zoom in\)", \{ n: idsLeftOut\.toLocaleString\(\) \}\)/);
  assert.match(p, /if \(b\.contourLevels\?\.length && b\.contourLabels !== false\) \{\n\s+let spots = CONTOUR_SPOTS\.get\(b\);\n\s+if \(!spots\) \{ spots = contourLabelSpots\(b\); CONTOUR_SPOTS\.set\(b, spots\); \}/);
  // the spots the plan writes are the 3D View's own
  const b = { contourLevels: [100, 150, 200, 250, 300, 350, 400, 450, 500, 550], contourInterval: 50, polylines: Array.from({ length: 10 }, (_, i) => Array.from({ length: 20 }, (__, k) => ({ x: k * 50, y: i * 100 }))) };
  const spots = contourLabelSpots(b);
  assert.deepEqual([...new Set(spots.map((s) => s.text))].sort(), ["250", "500"], "every fifth level of a regular series");
});
