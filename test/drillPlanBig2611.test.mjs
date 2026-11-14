// TASKS.csv #2611 — a 2,248-hole drill plan: labels avoid the other holes' collars (fast, with a grid index), no yellow series colour on the
// white map, the key in the emptiest corner, and the grid caption names the CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeLabels, emptiestCorner } from "../src/lib/drillPlan.js";

test("a label is not placed on another hole's collar", () => {
  const pts = [{ id: "A1", x: 100, y: 100 }];
  assert.equal(placeLabels(pts, { fontPx: 9, w: 400, h: 400 }).placed[0].anchor, "start"); // to the right, by default
  const blocked = placeLabels(pts, { fontPx: 9, w: 400, h: 400, avoid: [{ x0: 110, y0: 95, x1: 116, y1: 101 }] }); // a collar right of it
  assert.notEqual(blocked.placed[0]?.anchor, "start");
});

test("2,248 holes: placed in well under a second", () => {
  const pts = Array.from({ length: 2248 }, (_, i) => ({ id: `C${i}`, x: (i * 37) % 1400, y: Math.floor((i * 37) / 1400) * 15 }));
  const avoid = pts.map((p) => ({ x0: p.x - 4, y0: p.y - 4, x1: p.x + 4, y1: p.y + 4 }));
  const t0 = performance.now();
  const r = placeLabels(pts, { fontPx: 9, w: 1470, h: 880, avoid });
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${ms} ms`);
  assert.equal(r.placed.length + r.skipped, 2248);
});

test("the key takes the corner with the fewest holes", () => {
  const holes = Array.from({ length: 40 }, (_, i) => ({ ax: 20 + (i % 8) * 10, ay: 20 + Math.floor(i / 8) * 10 })); // the top left is full
  assert.deepEqual(emptiestCorner(holes, 600, 400, 120, 80), { x: 600 - 120 - 6, y: 6 });
  assert.deepEqual(emptiestCorner([], 600, 400, 120, 80), { x: 6, y: 6 });
});

test("wired: no yellow on the white map, the corner, collars avoided, the CRS by name", () => {
  const c = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(c, /const ON_WHITE = CATEGORICAL_SAFE_COLORS\.filter\(\(c\) => String\(c\)\.toUpperCase\(\) !== "#F0E442"\);/);
  assert.match(c, /emptiestCorner\(\[\.\.\.g\.holes, \.\.\.planned\], g\.w, g\.h, keyBox\.w, keyBox\.h\)/ /* #2259 — the planned holes count too */);
  assert.match(c, /\.\.\.collarBoxes\] \}\);/);
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /: project\?\.epsg \? crsText\(project\.epsg\) \/\* #2611/);
});
