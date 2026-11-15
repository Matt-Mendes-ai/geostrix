// TASKS.csv #3350 (Galore Creek review) — a per-hole grid made 'at the intercepts' drew its figure's dots at the collars and carried no word of
// the placement in its name
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { perHoleFigureAtIntercepts } from "../src/lib/holeValueGrid.js";

const collars = [{ hole_id: "A", x: 1000, y: 2000, z: 500, depth: 200, dip: -60, azimuth: 90 }];
const survey = [{ hole_id: "A", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "A", depth: 200, azimuth: 90, dip: 60 }];
const assays = [{ hole_id: "A", from: 0, to: 10, values: { Cu: 0.1 } }, { hole_id: "A", from: 100, to: 110, values: { Cu: 2.4 } }];
const ctx = { assayElements: [{ symbol: "Cu", unit: "%" }], assays, collars, survey, desurveyMethod: "minimumCurvature" };

test("the figure's dot sits at the middle of the highest interval on the desurveyed hole, 52 m from the collar, not at it", () => {
  const g = { source: "holes", sourceId: "a:Cu", stat: "max", placeAt: "intercept" };
  const pts = perHoleFigureAtIntercepts(g, ctx);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].v, 2.4);
  assert.ok(Math.abs(pts[0].x - 1052.5) < 1e-6 && Math.abs(pts[0].y - 2000) < 1e-6); // 105 m at 60 degrees: 52.5 m east
  assert.deepEqual(perHoleFigureAtIntercepts({ ...g, sourceId: "nothing" }, ctx), []);
});

test("the raster carries placeAt and 'at intercepts' in its name; the figure and its legend use them", () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const h = read("components/HoleValueGridPanel.jsx");
  assert.match(h, /\$\{placeAt === "intercept" \? " at intercepts" : ""\}/);
  assert.match(h, /source: "holes", placeAt, sourceId: source\.id/);
  const m = read("components/MapsPlanView.jsx");
  assert.match(m, /if \(g\.placeAt === "intercept"\) return perHoleFigureAtIntercepts\(g, ctx\);/);
  assert.match(m, /tr\("\{n\} holes at their intercepts, on the grid's colour scale"/);
});
