// TASKS.csv #3267 (review #3195, Galore Creek) — the Alteration layer could not be the modelled unit (so its assemblages could not be grouped
// or built as one body), and 'NR' (not recorded) rows counted as 'not potassic' in the halo's indicator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unitSourceLayers, applyUnitSource } from "../src/lib/unitSource.js";
import { isNotRecorded } from "../src/lib/notRecorded.js";

const alt = [
  { hole_id: "G1", from: 0, to: 30, value: "Calcic-potassic (Garnet Dominant)" },
  { hole_id: "G1", from: 30, to: 40, value: "Calcic-potassic (Diopside Dominant)" },
  { hole_id: "G1", from: 40, to: 45, value: "NR" },
  { hole_id: "G1", from: 45, to: 60, value: "No High-T Assemblage" },
];
const layers = { litho: [{ hole_id: "G1", from: 0, to: 60, value: "i9a" }], alt, breccia: [{ hole_id: "G1", from: 10, to: 12, value: "BX-HYD" }], weath: [] };

test("#3267 the Alteration and Breccia layers are offered as the unit, and read as the units", () => {
  const opts = unitSourceLayers(layers, []);
  assert.deepEqual(opts.map((o) => [o.name, o.label, o.rows]), [["@alt", "Alteration", 4], ["@breccia", "Breccia", 1]]);
  const u = applyUnitSource(layers, "@alt", []);
  assert.deepEqual(u.litho.map((r) => r.value), alt.map((r) => r.value));
  assert.equal(u.alt, alt, "the other layers are untouched");
  assert.equal(applyUnitSource({ ...layers, weath: [{ hole_id: "G1", from: 0, to: 5, value: "OX" }] }, "@weath", []).litho[0].value, "OX", "Weathering as before (#2529)");
});

test("#3267 'not recorded' codes are unknown in the indicator; a 'No ... Assemblage' stays a true zero", () => {
  for (const v of ["NR", "nr", "N/R", "Not recorded", "not  logged", "Unknown", "?"]) assert.equal(isNotRecorded(v), true, v);
  for (const v of ["No High-T Assemblage", "None", "Potassic", "", null, "NRX"]) assert.equal(isNotRecorded(v), false, String(v));
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /if \(!isTarget && isNotRecorded\(r\.value\)\) \{ notRecordedM \+= /);
  assert.match(src, /coded as not recorded \(NR, not logged, unknown\) were left out as unknown/);
});
