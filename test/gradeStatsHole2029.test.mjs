// TASKS.csv #2029 (review #2013, Geochem) — Grade stats groups by hole and by hole + lithology (a per-hole mean needed SQL).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the domain list offers Hole and Hole + lithology; rows group on the hole id; holes sort in id order", () => {
  assert.match(g, /const HOLE_KEY = "__hole", HOLE_LITHO_KEY = "__hole_litho";/);
  assert.match(g, /<option value=\{HOLE_KEY\}>\{tr\("Hole"\)\}<\/option>/);
  assert.match(g, /\(layers\.litho \|\| \[\]\)\.length > 0 && <option value=\{HOLE_LITHO_KEY\}>/);
  assert.match(g, /const domain = domainKey === HOLE_KEY \? s\.hole_id : domainKey === HOLE_LITHO_KEY \? `\$\{s\.hole_id\} · \$\{lith == null \? "\(unclassified\)" : lith\}`/);
  assert.match(g, /domainKey === HOLE_LITHO_KEY \? layers\.litho/);
  assert.match(g, /localeCompare\(String\(b\.key\), undefined, \{ numeric: true \}\)/);
  assert.match(g, /k === HOLE_KEY \? "Hole" : k === HOLE_LITHO_KEY \? "Hole \+ lithology"/); // the export's domains line
});
