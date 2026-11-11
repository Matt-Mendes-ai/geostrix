// TASKS.csv #2519 — default Li classes took the half-limit substitutes into their percentiles (18 % at the floor, under the 30 % test) while
// Ta beside it dropped them: two rules without a word. The stored '<' flag now leaves them out for every element, the dialog says how the
// defaults were made, and a typed cut-off can be a class limit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayClassRange, roundBreaks, addClassLimit } from "../src/lib/assayClasses.js";
import { seedBreaks } from "../src/lib/colorRamp.js";

// Li in %: 18 % half-limit substitutes ('<0.01 % Li2O' = '<0.004645 % Li', stored at 0.0023), the rest log-spread up to 3.3 %
const li = [];
for (let i = 0; i < 180; i++) li.push({ values: { Li: 0.0023226 }, qualifiers: { Li: "<" } });
for (let i = 0; i < 820; i++) li.push({ values: { Li: Number((0.01 * Math.pow(330, i / 819)).toFixed(4)) }, qualifiers: {} });

test("flagged '<' values are left out of the class percentiles, whatever their share", () => {
  const r = assayClassRange(li, "Li");
  assert.deepEqual(r.basis, { kind: "flags", n: 820, left: 180 });
  assert.equal(r.min, 0.0023226, "the data range still shows every stored value");
  assert.ok(r.p50 > 0.1, `P50 ${r.p50} is a detected grade, not the floor`);
  const breaks = seedBreaks(r, "#e0894a");
  assert.ok(breaks[0].max > 0.1, "the Low class no longer ends at the substitutes");
});

test("without flags: the #1696 floor test, and plain percentiles", () => {
  const floorRows = [...Array(400).fill(0.0005), ...Array.from({ length: 600 }, (_, i) => 0.001 + i / 100)].map((v) => ({ values: { Au: v } }));
  const r = assayClassRange(floorRows, "Au");
  assert.equal(r.basis.kind, "floor"); assert.equal(r.basis.left, 400); assert.equal(r.basis.floor, 0.0005); assert.equal(r.basis.n, 600);
  const plain = Array.from({ length: 101 }, (_, i) => ({ values: { Cu: i } }));
  const p = assayClassRange(plain, "Cu");
  assert.deepEqual(p.basis, { kind: "all", n: 101, left: 0 });
  assert.equal(p.p50, 50); assert.equal(p.p90, 90);
  const none = assayClassRange([{ values: {} }], "Cu");
  assert.equal(none.basis.n, 0);
  assert.equal(assayClassRange(li.map((a) => ({ ...a, qualifiers: undefined, bdl: a.qualifiers?.Li ? ["Li"] : [] })), "Li").basis.kind, "flags", "a surface bdl list counts as a flag");
});

test("round limits, a typed cut-off as a class limit", () => {
  const b = [{ max: 0.0441, color: "#a" }, { max: 1.1256, color: "#b" }, { max: 1.9492, color: "#c" }, { max: 3.316, color: "#d" }];
  assert.deepEqual(roundBreaks(b).map((x) => x.max), [0.044, 1.1, 1.9, 3.3]);
  assert.deepEqual(roundBreaks([{ max: 1.12 }, { max: 1.14 }]).map((x) => x.max), [1.1, 1.14], "limits that would meet keep a figure more");
  const c = addClassLimit(b, 0.4645, "#base");
  assert.deepEqual(c.map((x) => x.max), [0.0441, 0.4645, 1.1256, 1.9492, 3.316]);
  assert.equal(c[1].color, "#a", "the new lower class takes the colour of the class below it");
  assert.equal(c[1].label, "< 0.4645");
  assert.equal(addClassLimit(b, 1.1256, "#x"), b, "an existing limit: unchanged");
  assert.equal(addClassLimit(b, "x", "#x"), b);
  assert.equal(addClassLimit([], 1, "#base")[0].color, "#base");
});

test("wired: the 3D view's ranges come from the lib; the dialog says how and offers the tools", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /return \(c\.by\[symbol\] = assayClassRange\(lab\.length \? lab : assays, symbol\)\);/);
  const m = readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /Default classes: the 50th, 90th and 97\.5th percentiles of the \{n\} detected values/);
  assert.match(m, /onClick=\{roundAll\}/);
  assert.match(m, /onClick=\{addCutoff\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Add as a class limit"], l);
});
