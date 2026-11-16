// TASKS.csv #3826 — Maps > Grid a per-hole value: holes drilled as fans from pads. Their values sit at the collars by default and each pad becomes one
// number; the panel now opens on the intercept when a pad's holes part by more than a cell, and says how many holes share a collar when it is kept.
// SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { perHoleSpan, perHoleValue, holeSamplesAt, placementAdvice } from "../src/lib/holeValueGrid.js";

// 4 pads 400 m apart, three holes each fanning at azimuths 0 / 120 / 240, dip 60 (an interval at 200 m along lies 100 m from the pad)
const collars = [], survey = [], rows = [];
const grades = [[91.5, 3.72, 20.1], [18.7, 59.2, 3.77], [0.008, 0.009, 3.65], [5, 6, 7]];
for (let p = 0; p < 4; p++) for (let k = 0; k < 3; k++) {
  const id = `P${p}-${k}`;
  collars.push({ hole_id: id, x: 1000 + p * 400 + k * 2, y: 2000, z: 500 });
  survey.push({ hole_id: id, depth: 0, azimuth: k * 120, dip: 60 }, { hole_id: id, depth: 400, azimuth: k * 120, dip: 60 });
  rows.push({ hole_id: id, from: 190, to: 210, values: { Au: grades[p][k] } });
}
const v = perHoleValue(rows, "Au", "max"), spans = perHoleSpan(rows, "Au", "max");
const at = (a, c = collars, s = survey) => holeSamplesAt(c, v, spans, { survey: s, desurveyMethod: "minimumCurvature", at: a });

test("fans from pads: the holes share collars, their values part by more than a cell down the holes: intercept advised", () => {
  const adv = placementAdvice(at("collar").samples, at("intercept").samples, 50);
  assert.equal(adv.holes, 12); assert.equal(adv.padHoles, 12); assert.equal(adv.pads, 4);
  assert.equal(adv.apart, 12); assert.equal(adv.far, 12); assert.equal(adv.intercept, true);
});

test("at the collar a pad is one cell; at the intercepts each hole's value lands in a cell of its own", () => {
  const cellsOf = (samples) => new Set(samples.filter((s) => s.hole_id.startsWith("P0")).map((s) => Math.floor(s.x / 50) + "," + Math.floor(s.y / 50))).size;
  assert.equal(cellsOf(at("collar").samples), 1); // the three values (91.5, 3.72, 20.1) meet in one 50 m cell
  assert.equal(cellsOf(at("intercept").samples), 3); // 100 m out along three azimuths
});

test("holes that do not share a collar and stand vertical: the collar stays the default", () => {
  const c2 = collars.map((c, i) => ({ ...c, hole_id: "V" + i, x: 1000 + i * 120 })), s2 = c2.flatMap((c) => [{ hole_id: c.hole_id, depth: 0, azimuth: 0, dip: 90 }, { hole_id: c.hole_id, depth: 400, azimuth: 0, dip: 90 }]);
  const r2 = rows.map((r, i) => ({ ...r, hole_id: "V" + i })), vv = perHoleValue(r2, "Au", "max"), ss = perHoleSpan(r2, "Au", "max");
  const o = { survey: s2, desurveyMethod: "minimumCurvature" };
  const adv = placementAdvice(holeSamplesAt(c2, vv, ss, { ...o, at: "collar" }).samples, holeSamplesAt(c2, vv, ss, { ...o, at: "intercept" }).samples, 50);
  assert.equal(adv.padHoles, 0); assert.equal(adv.far, 0); assert.equal(adv.intercept, false);
});

test("twin holes on one collar, both vertical: they share a point but do not part, so the collar stays", () => {
  const c3 = [{ hole_id: "T1", x: 10, y: 10, z: 0 }, { hole_id: "T2", x: 10.2, y: 10, z: 0 }], s3 = c3.flatMap((c) => [{ hole_id: c.hole_id, depth: 0, azimuth: 0, dip: 90 }, { hole_id: c.hole_id, depth: 100, azimuth: 0, dip: 90 }]);
  const r3 = [{ hole_id: "T1", from: 10, to: 20, values: { Au: 1 } }, { hole_id: "T2", from: 10, to: 20, values: { Au: 2 } }], vv = perHoleValue(r3, "Au", "max"), ss = perHoleSpan(r3, "Au", "max");
  const o = { survey: s3, desurveyMethod: "minimumCurvature" };
  const adv = placementAdvice(holeSamplesAt(c3, vv, ss, { ...o, at: "collar" }).samples, holeSamplesAt(c3, vv, ss, { ...o, at: "intercept" }).samples, 50);
  assert.equal(adv.pads, 1); assert.equal(adv.apart, 0); assert.equal(adv.intercept, false);
});

test("wiring: the choice is null until the user picks; both notes are said", () => {
  const m = readFileSync(new URL("../src/components/HoleValueGridPanel.jsx", import.meta.url), "utf8");
  assert.match(m, /useState\(null\); \/\/ TASKS\.csv #3826/);
  assert.match(m, /const placeAt = placeAtChoice \|\| \(advice\?\.intercept \? "intercept" : "collar"\)/);
  assert.match(m, /share \{k\} collar points: their values are combined there/);
  assert.match(m, /so each is placed at its intercept\. Choose the collar/);
});
