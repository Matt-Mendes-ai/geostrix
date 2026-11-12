// TASKS.csv #2745 (follow-up of #2658) — Maps > Grid a per-hole value: each value placed at its intercept down the desurveyed hole (an
// inclined hole's intercept is not under its collar), and a threshold depth as vertical depth below the collar. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { perHoleSpan, perHoleValue, holeSamplesAt, holeValueMeta } from "../src/lib/holeValueGrid.js";

const rows = [
  { hole_id: "A", from: 0, to: 50, values: { U: 10 } }, { hole_id: "A", from: 100, to: 110, values: { U: 900 } }, { hole_id: "A", from: 150, to: 160, values: { U: 900 } },
  { hole_id: "B", from: 20, to: 40, values: { U: 300 } }, { hole_id: "B", from: 60, to: 80, values: { U: 50 } },
  { hole_id: "C", from: 0, to: 10, values: { U: 5 } },
];
// A: inclined at 60 toward east (stored dip +60 = down); B: vertical; C: no survey (the collar's own dip / azimuth, or nothing)
const collars = [{ hole_id: "A", x: 1000, y: 2000, z: 500 }, { hole_id: "B", x: 1500, y: 2000, z: 480 }, { hole_id: "C", x: 0, y: 0, z: 400 }];
const survey = [{ hole_id: "A", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "A", depth: 400, azimuth: 90, dip: 60 }, { hole_id: "B", depth: 0, azimuth: 0, dip: 90 }, { hole_id: "B", depth: 200, azimuth: 0, dip: 90 }];

test("the span each value came from: the highest (the shallowest of equal), the first over a threshold, the valued span for a mean", () => {
  assert.deepEqual(perHoleSpan(rows, "U", "max").get("A"), { from: 100, to: 110 });
  assert.deepEqual(perHoleSpan(rows, "U", "firstOver", { threshold: 100 }).get("A"), { from: 100, to: 110 });
  assert.deepEqual(perHoleSpan(rows, "U", "firstOver", { threshold: 100 }).get("B"), { from: 20, to: 40 });
  assert.equal(perHoleSpan(rows, "U", "firstOver", { threshold: 100 }).has("C"), false);
  assert.deepEqual(perHoleSpan(rows, "U", "mean").get("A"), { from: 0, to: 160 });
});

test("placed at the intercept: the inclined hole's value sits 52.5 m east of its collar; vertical depth below the collar", () => {
  const v = perHoleValue(rows, "U", "max"), spans = perHoleSpan(rows, "U", "max");
  const at = holeSamplesAt(collars, v, spans, { survey, desurveyMethod: "minimumCurvature", at: "intercept" });
  const a = at.samples.find((s) => s.hole_id === "A");
  assert.ok(Math.abs(a.x - (1000 + 105 * Math.cos(Math.PI / 3))) < 0.01, String(a.x)); // 105 m down a hole dipping 60: 52.5 m east
  assert.ok(Math.abs(a.y - 2000) < 0.01);
  assert.equal(a.values.value, 900);
  const b = at.samples.find((s) => s.hole_id === "B");
  assert.ok(Math.abs(b.x - 1500) < 1e-6 && Math.abs(b.y - 2000) < 1e-6); // vertical: under its collar
  const col = holeSamplesAt(collars, v, spans, { survey, at: "collar" });
  assert.deepEqual(col.samples.find((s) => s.hole_id === "A").x, 1000);
  assert.equal(col.atCollar, 0);
  // vertical depth to U >= 100: hole A's interval top at 100 m along a 60-degree hole = 86.6 m below the collar; B vertical = 20
  const d = perHoleValue(rows, "U", "firstOver", { threshold: 100 }), ds = perHoleSpan(rows, "U", "firstOver", { threshold: 100 });
  const vd = holeSamplesAt(collars, d, ds, { survey, desurveyMethod: "minimumCurvature", verticalDepth: true, at: "collar" });
  assert.ok(Math.abs(vd.samples.find((s) => s.hole_id === "A").values.value - 100 * Math.sin(Math.PI / 3)) < 0.01);
  assert.ok(Math.abs(vd.samples.find((s) => s.hole_id === "B").values.value - 20) < 0.01);
  const along = holeSamplesAt(collars, d, ds, { survey, at: "collar" });
  assert.equal(along.samples.find((s) => s.hole_id === "A").values.value, 100); // unchanged along the hole
  assert.match(holeValueMeta({ symbol: "U", unit: "ppm" }, "firstOver", 100, { verticalDepth: true }).what, /^vertical depth to U >= 100 ppm$/);
});

test("a hole with no survey is desurveyed straight down (under its collar); one with no span to place stays at the collar and is counted", () => {
  const v = new Map([["X", 7], ["Y", 3]]);
  const r = holeSamplesAt([{ hole_id: "X", x: 10, y: 20, z: 0 }, { hole_id: "Y", x: 30, y: 40, z: 0 }], v, new Map([["X", { from: 5, to: 6 }]]), { survey: [], at: "intercept" });
  assert.deepEqual(r.samples.map((s) => [s.hole_id, s.x, s.y]), [["X", 10, 20], ["Y", 30, 40]]);
  assert.equal(r.atCollar, 1); // Y: no span
});

test("the panel offers the placement and the depth, and says which", () => {
  const src = readFileSync(new URL("../src/components/HoleValueGridPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /<option value="collar">\{tr\("The collar"\)\}<\/option><option value="intercept">\{tr\("The intercept, down the desurveyed hole"\)\}<\/option>/);
  // #2991: the depth choice also serves a coded log's top / base (isDepth: firstOver, top or base)
  assert.match(src, /const isDepth = st === "firstOver" \|\| st === "top" \|\| st === "base";/);
  assert.match(src, /\{isDepth && <label style=\{lbl\}>\{tr\("Depth"\)\}/);
  // #2991: a coded log brings its own spans (perHoleCoded), and an RL statistic asks holeSamplesAt for the elevation
  assert.match(src, /holeSamplesAt\(collars, values, coded \? codedRes\.spans : source \? perHoleSpan\(rows, source\.symbol, st, \{ threshold \}\) : new Map\(\), \{ key: KEY, survey, desurveyMethod, verticalDepth: vertical, at: placeAt, rl \}\)/);
  assert.match(src, /at the \$\{placeAt === "intercept" \? "intercepts, on the desurveyed holes" : "collars"\}/);
});
