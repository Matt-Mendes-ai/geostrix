// TASKS.csv #3344 (review #3195, Galore Creek) — Evidence overlay's 'the drilling' was the box of every hole (29 x 15 km): the central zone
// could only be scored by typing four coordinates. An Area can now be the checked holes or the holes where a collar field has a value.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceExtent } from "../src/lib/evidence.js";
import { collarsWithPick } from "../src/lib/holeFilter.js";

test("a set of holes' box becomes the grid extent; the collar-field pick is the cards' own", () => {
  assert.deepEqual(evidenceExtent("holes", { holes: [10, 20, 110, 220] }), [10, 20, 110, 220]);
  assert.equal(evidenceExtent("holes", { holes: null }), null);
  const collars = [{ hole_id: "A", attrs: { zone: "Central" } }, { hole_id: "B", attrs: { zone: "North" } }, { hole_id: "C", attrs: { zone: "Central" } }];
  assert.deepEqual(collarsWithPick(collars, "zone=Central").map((c) => c.hole_id), ["A", "C"]);
});

test("wiring: the checked holes and 'holes where' as Areas, the view passes the checked holes; keys", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /if \(gridArea === "checked"\) ids = checkedHoleIds;\n\s*else if \(gridArea\.startsWith\("holes:"\)\) ids = new Set\(collarsWithPick\(collars, gridArea\.slice\(6\)\)\.map\(\(c\) => c\.hole_id\)\);/);
  assert.match(p, /const ext = holeArea \? evidenceExtent\("holes", \{ holes: holeArea \}\) :/);
  assert.match(p, /nChecked > 0 && nChecked < collars\.length && <option value="checked">/);
  assert.match(p, /<optgroup label=\{tr\("Holes where…"\)\}>/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /<EvidenceOverlayPane solids=[^\n]*checkedHoleIds=\{checkedHoleIds\} \/\* #3344 \*\/ \/><\/Suspense>/);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of ["the checked holes ({n} of {total})", "Holes where…"]) assert.ok(d[k], `${l}: ${k}`); }
});
