// TASKS.csv #3653 (Fireweed re-test R1, Macpass Tom West) — the block model's record said '35 collar(s) ... left out of that ground ... (benches)'
// (collarBenches over all 559 collars) while the dialog said 53 underground collars and 4 surface ones were set aside, which is what the cut used.
// The record's clause now comes from the same collars and checks as the dialog's note (lib/collarLevelsText.js collarGroundRecord).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarGroundRecord, collarLevelsText } from "../src/lib/collarLevelsText.js";

const csv = (f) => { const [h, ...rows] = readFileSync(new URL(`../sample_data/yk_macpass/${f}`, import.meta.url), "utf8").trim().split(/\r?\n/); const k = h.split(","); return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [k[i], v]))); };
const collars = csv("collars.csv").filter((c) => c.prospect === "Tom West").map((c) => ({ hole_id: c.hole_id, x: +c.x, y: +c.y, z: +c.z, attrs: { hole_type: c.hole_type } }));
const tw = new Set(collars.map((c) => c.hole_id));
const survey = csv("survey.csv").filter((s) => tw.has(s.hole_id)).map((s) => ({ hole_id: s.hole_id, depth: +s.depth, azimuth: +s.azimuth, dip: -+s.dip }));

test("Tom West: the record says what the dialog says — 53 underground collars set aside, then 4 surface collars on the bench check", () => {
  assert.equal(collars.length, 143);
  const rec = collarGroundRecord(collars, survey);
  assert.match(rec, /^; 53 collar\(s\) set aside as underground drilling \(53 by hole type, /);
  assert.match(rec, /; 4 surface collar\(s\) with another collar within 15 m in plan over 5 m lower left out of that ground, so the lowest collar is used there \(steep ground, benches or a pit: TS016, TS17-001, TS18-011, TYK008\)$/);
  assert.doesNotMatch(rec, /35 collar/);
  const dialog = collarLevelsText(collars, survey);
  assert.match(dialog, /53 collar\(s\) look like underground drilling/);
  assert.match(dialog, /Left out: TS016, TS17-001, TS18-011, TYK008\./);
});

test("no collar left out: no clause; the dialog's record uses it with the note's collars", () => {
  assert.equal(collarGroundRecord([{ hole_id: "A", x: 0, y: 0, z: 100 }, { hole_id: "B", x: 500, y: 0, z: 110 }], []), "");
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /dropped \(no terrain\)\$\{collarGroundRecord\(levelCollars, survey\)\}`/);
  assert.doesNotMatch(m, /collarBenches\(collars\)/);
});
