// TASKS.csv #1655 — Collar_Az_D is guessed as the azimuth; a re-import that adds fields is not 'identical'.
import test from "node:test";
import assert from "node:assert/strict";
import { guessMapping, diffCollarImport, mergeCollar } from "../src/lib/layers.js";

test("acQuire collar headers: azimuth and dip both guessed", () => {
  const m = guessMapping("collars", ["HOLEID", "EAST", "NORTH", "RL", "DEPTH", "Collar_Type", "Collar_Az_D", "Collar_Dip_D"]);
  assert.equal(m.azimuth, "Collar_Az_D");
  assert.equal(m.dip, "Collar_Dip_D");
  assert.notEqual(guessMapping("collars", ["HOLEID", "EAST", "NORTH", "RL", "Hazard_Note"]).azimuth, "Hazard_Note");
});

test("new extra fields are a fill, a different one a change, the same ones identical", () => {
  const base = { hole_id: "A", x: 1, y: 2, z: 3, dip: -60, _src: "a.csv", attrs: { Collar_Type: "DDH" } };
  const add = diffCollarImport([base], [{ hole_id: "A", x: 1, y: 2, z: 3, dip: -60, PROSPECT: "Copley", STARTDATE: "2023-06-01", _src: "b.csv" }]);
  assert.deepEqual(add.unchanged, []);
  assert.deepEqual(add.filled, [{ hole_id: "A", fields: ["PROSPECT", "STARTDATE"] }]);
  const kept = { ...base, PROSPECT: "Copley" };
  const ch = diffCollarImport([kept], [{ hole_id: "A", x: 1, y: 2, z: 3, PROSPECT: "Copley South", attrs: { Collar_Type: "DDH" } }]);
  assert.deepEqual(ch.changed.map((c) => [c.fields, c.before, c.after, c.shift]), [[["PROSPECT"], { PROSPECT: "Copley" }, { PROSPECT: "Copley South" }, 0]]);
  assert.deepEqual(diffCollarImport([kept], [{ hole_id: "A", x: 1, y: 2, z: 3, PROSPECT: "Copley", attrs: { Collar_Type: "DDH" }, _src: "c.csv" }]).unchanged, ["A"]);
  const attrNew = diffCollarImport([base], [{ hole_id: "A", x: 1, y: 2, z: 3, attrs: { Collar_Type: "DDH", Drill_Rig: "R2" } }]);
  assert.deepEqual(attrNew.filled, [{ hole_id: "A", fields: ["Drill_Rig"] }]);
});

test("kept columns merge one by one, declining keeps the old value but takes the new column", () => {
  const prev = { hole_id: "A", attrs: { Collar_Type: "DDH", Old: "1" } };
  assert.deepEqual(mergeCollar(prev, { hole_id: "A", attrs: { Collar_Type: "RC", Drill_Rig: "R2" } }, false).attrs, { Collar_Type: "DDH", Old: "1", Drill_Rig: "R2" });
  assert.deepEqual(mergeCollar(prev, { hole_id: "A", attrs: { Collar_Type: "RC" } }, true).attrs, { Collar_Type: "RC", Old: "1" });
});
