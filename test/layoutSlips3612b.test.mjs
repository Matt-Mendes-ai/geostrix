// TASKS.csv #3612 (Fireweed rehearsal, steps 6 and 7), the rest: (6) the rig CSV read back keeps its z_source note; (7) the sidebar says when the selected element reaches past the sheet; (8) the planned-hole
// check lists the next two nearest holes beside the nearest. Not done: (2) the paper from the place or the system (the first page is made in the store), (3) the project name from the file name (by design,
// #199), (9) the section sheet's stub, (10) is #3529's (the legend's heading has its unit).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { plannedHolesFromRows } from "../src/lib/plannedImport.js";
import { planChecks, drilledTraceIndex } from "../src/lib/plannedHoleChecks.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("(6) a z_source column is read back and not lost", () => {
  const headers = ["name", "x", "y", "z", "azimuth_grid", "dip", "length", "z_source"];
  const r = plannedHolesFromRows([{ name: "P1", x: 1, y: 2, z: 3, azimuth_grid: 90, dip: -60, length: 100, z_source: "the ground interpolated between the nearest collars" }, { name: "P2", x: 1, y: 2, z: 3, azimuth_grid: 90, dip: -60, length: 100, z_source: "" }], headers);
  assert.equal(r.holes[0].zSourceFile, "the ground interpolated between the nearest collars"); assert.equal(r.holes[1].zSourceFile, undefined);
  assert.match(read("../src/components/PlannedHoleParts.jsx"), /zSourceFile \? `\$\{zSourceFile\} \(as written in \$\{file\.name\}\)`/);
});
test("(8) the nearest hole carries the next two nearest holes, each at its own closest point", () => {
  const collars = [0, 1, 2, 3].map((i) => ({ hole_id: `H${i}`, x: 1000 + i * 40, y: 1000, z: 500, azimuth: 0, dip: -90, length: 100 }));
  const survey = collars.flatMap((c) => [0, 100].map((d) => ({ hole_id: c.hole_id, depth: d, azimuth: 0, dip: -90 })));
  const drilled = drilledTraceIndex(collars, survey, "minimum_curvature");
  const [r] = planChecks([{ id: "p", name: "P", x: 1001, y: 1005, z: 500, azimuth: 0, dip: -90, length: 100 }], drilled, []);
  assert.equal(r.nearestReal.hole_id, "H0");
  assert.deepEqual(r.nearestReal.also.map((h) => h.hole_id), ["H1", "H2"]);
  assert.ok(r.nearestReal.also[0].distance > r.nearestReal.distance && r.nearestReal.also[1].distance > r.nearestReal.also[0].distance);
  assert.match(read("../src/components/PlannedHoleParts.jsx"), /tr\("Then: \{list\}"/);
});
test("(7) the selected element is measured against the sheet and the sidebar says which edge", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /const \[selPast, setSelPast\] = useState\(\[\]\);/); assert.match(l, /selPast\.length > 0 && <div role="status"/);
  const key = "Part of this element reaches past the sheet's {sides} and will be cut off in the export: move it, or make it smaller.";
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[key], lang);
});
