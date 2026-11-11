// TASKS.csv #2269 (review #2174, WA lode gold) — a map drawn with no terrain lies at a stated plan elevation, not the scene's origin plane
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planElevation, planElevationText } from "../src/lib/drapeElevation.js";
import { addUnitPolygon, geologyPolygonLayer, addInterpretationLine, interpretationLayer } from "../src/lib/interpretation.js";

// collars from underground: upholes (stored dip < 0 is upward) and collars stacked over each other (the WA review's shape)
const ug = [];
for (let i = 0; i < 6; i++) ug.push({ hole_id: `U${i}`, x: 100 + i, y: 200, z: 389 - i * 40, dip: i % 2 ? -30 : 60 });
const ugSurvey = ug.map((c) => ({ hole_id: c.hole_id, depth: 0, dip: c.dip }));

test("underground collars: the highest collar, said as such", () => {
  const d = planElevation({ collars: ug, survey: ugSurvey });
  assert.deepEqual(d, { z: 389, source: "highest-collar" });
  assert.match(planElevationText(d), /^No terrain: drawn flat at 389 m RL, the highest collar \(the collars look underground\)/);
});

test("surface collars keep the map-layer rule (median collar); none at all: 0, said", () => {
  const surf = [{ hole_id: "A", x: 0, y: 0, z: 100, dip: 60 }, { hole_id: "B", x: 500, y: 0, z: 120, dip: 60 }, { hole_id: "C", x: 0, y: 500, z: 140, dip: 60 }];
  assert.deepEqual(planElevation({ collars: surf, survey: [] }), { z: 120, source: "collars" });
  assert.match(planElevationText(planElevation({})), /^No terrain: drawn flat at 0 m RL\./);
});

test("the stated elevation wins over the clicks' median for a first polygon / line, later ones keep the layer's", () => {
  const sq = [{ x: 0, y: 0, z: 205.12 }, { x: 100, y: 0, z: 205.12 }, { x: 100, y: 100, z: 205.12 }, { x: 0, y: 100, z: 205.12 }];
  const a = addUnitPolygon(geologyPolygonLayer("g"), sq, { unit: "SMP" }, { elevation: 389 });
  assert.equal(a.elevation, 389);
  assert.equal(addUnitPolygon(a, sq, { unit: "ISY" }, { elevation: 500 }).elevation, 389);
  assert.equal(addUnitPolygon(geologyPolygonLayer("g"), sq, { unit: "SMP" }).elevation, 205.12); // with a terrain: the clicks, as before
  assert.equal(addInterpretationLine(interpretationLayer("i"), sq.slice(0, 2), { type: "fault" }, { elevation: 389 }).elevation, 389);
});

test("both panes pass it with no terrain and say it", () => {
  for (const f of ["UnitPolygonPane", "InterpretPane"]) {
    const s = readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8");
    assert.match(s, /plan \? \{ elevation: (plan\.z|elevNow) \} : \{\}/, f); // #2522: InterpretPane's Elev. box (elevNow falls back to plan.z)
    assert.match(s, /\{plan && <div role="note"[^>]*>\{planElevationText\(plan\)\}<\/div>\}/, f);
  }
});
