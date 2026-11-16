// TASKS.csv #3773 — 1,859 gold samples at exactly 0.0025 g/t (half a detection limit, 19 % of the column) read as grades in the 3D View: Identify
// printed 'Au 0.0025 g/t' with no word, and the Style dialog said nothing about a fifth of the column being one value. Grade statistics already knew
// the floor. Now Identify says it beside the value, from the same test (floorShare.floorOf), and the Style dialog says it once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { floorOf } from "../src/lib/floorShare.js";
import { floorWord, floorOfElement, assayValueText } from "../src/lib/viewer/identify.js";
import { assayClassRange } from "../src/lib/assayClasses.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rows = Array.from({ length: 200 }, (_, i) => ({ values: { Au: i < 38 ? 0.0025 : 0.01 + i * 0.01, Ag: 1 + (i % 17) / 3 } }));

test("a value on the column's floor is said so, with its share; another value is not", () => {
  const f = floorOf(rows, "Au", "ppm", {});
  assert.equal(f.share, 0.19); assert.equal(f.floor, 0.0025);
  assert.equal(floorWord(0.0025, f), " (the column's lowest and commonest value, 19 % of its samples: likely half a detection limit)");
  assert.equal(floorWord(0.5, f), "");
  assert.equal(floorWord(0.0025, null), ""); // no floor found in the column (fewer than 20 results on it, or under 5 %)
  assert.equal(floorWord(0.0025, { floor: 0.0025, share: 0.02 }), "");
});

test("worked out once per table and element", () => {
  assert.equal(floorOfElement(rows, "Au", {}), floorOfElement(rows, "Au", {}));
  assert.equal(floorOfElement(rows, "Ag", {}), null); // a column with no repeated minimum
  assert.equal(floorOfElement([], "Au", {}), null);
});

test("a flagged '<' result keeps its own wording; the card line is built from the floor only for unflagged values", () => {
  const row = { values: { Au: 0.0025 }, qualifiers: { Au: "<" } };
  assert.equal(assayValueText(row, "Au", "g/t"), "<0.005 g/t");
  const i = read("../src/lib/viewer/identify.js");
  assert.match(i, /\(row\.qualifiers\?\.\[sym\] \|\| row\.bdl\?\.includes\?\.\(sym\) \? "" : floorWord\(row\.values\[sym\], ctx\.floorOf\?\.\(sym\)\)\)/);
  assert.match(i, /floorOf: \(sym\) => floorOfElement\(r\.assays, sym, r\.units\)/);
});

test("the Style dialog's range carries the pile under the 30 % that drops it", () => {
  const r = assayClassRange(rows, "Au");
  assert.equal(r.basis.kind, "all"); // 19 % is not enough to drop it from the classes (as before)
  assert.deepEqual(r.basis.pile, { value: 0.0025, share: 0.19 });
  assert.equal(assayClassRange(rows, "Ag").basis.pile, undefined);
  const m = read("../src/components/AssayStyleModal.jsx");
  assert.match(m, /range\.basis\?\.pile && <div role="note"/);
  for (const k of [
    "the column's lowest and commonest value, {pct} % of its samples: likely half a detection limit",
    "{pct} % of the samples sit on the column's lowest value, {v} {unit}: likely half a detection limit, not a measured grade. They fall in the palest class.",
  ]) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
