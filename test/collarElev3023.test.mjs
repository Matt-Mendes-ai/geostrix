// TASKS.csv #3023 (review #2876, WA iron) — the Layout collar table printed an elevation the import filled in (the project median) as if it
// were surveyed; #3004's rule marks it ‡, and an elevation in the file that is probably missing §, with a footnote each
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elevationCell, elevationNotes, suspectIdsOf } from "../src/lib/collarTable.js";

const collars = [
  ...Array.from({ length: 20 }, (_, i) => ({ hole_id: `H${i}`, x: i, y: 0, z: 430 + i })),
  { hole_id: "RHDMET_0145", x: 1, y: 1, z: 438.811, zAssumed: "median" },
  { hole_id: "RHDMET_0149", x: 2, y: 1, z: 438.811, zAssumed: "median" },
  { hole_id: "RHRCMET_0154_A", x: 3, y: 1, z: 0 },
];

test("the cell: measured as before, ‡ assumed, § suspect, blank without an elevation", () => {
  const sus = suspectIdsOf(collars);
  assert.equal(sus, suspectIdsOf(collars), "computed once per collar list");
  assert.equal(elevationCell(collars[0], sus), "430.0");
  assert.equal(elevationCell(collars[20], sus), "438.8‡");
  assert.equal(elevationCell(collars[22], sus), "0.0§");
  assert.equal(elevationCell({ hole_id: "X", z: null }, sus), "");
  assert.equal(elevationCell({ hole_id: "Y", z: 12, zSuspect: true }, null), "12.0§", "the import's own flag when no set is given");
});

test("the notes name the marked holes and how the assumed ones were filled", () => {
  const sus = suspectIdsOf(collars);
  const n = elevationNotes(collars, sus);
  assert.deepEqual(n.map((x) => [x.mark, x.kind, x.ids]), [["‡", "assumed", ["RHDMET_0145", "RHDMET_0149"]], ["§", "suspect", ["RHRCMET_0154_A"]]]);
  assert.deepEqual(n[0].how, { median: 2 });
  assert.deepEqual(elevationNotes(collars.slice(0, 20), sus), []);
});

test("wiring: the Layout collar table prints the marked cell and the footnotes, and keeps the column right-aligned", () => {
  const g = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const suspectZ = suspectIdsOf\(ctx\?\.collars \|\| \[\]\);/);
  assert.match(g, /elevationCell\(c, suspectZ\) \/\* #3023: ‡ assumed, § suspect \*\//);
  assert.match(g, /for \(const n of elevationNotes\(sl\.rows, suspectZ\)\)/);
  assert.match(g, /\[\*†‡§\]\?\$\/\.test/);
});
