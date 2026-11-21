// TASKS.csv #3923 (Main) — a calculated element (an index, a TREO, an AuEq) keeps its formula and a signature of its inputs, says when the assays changed, and is recalculated
// in one click; an imported column kept as supplied is never touched. Synthetic assays.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addCalculatedElement, staleCalculated, recalculateElement, calcInputsSignature } from "../src/lib/calcElement.js";

const base = [{ symbol: "Zn", unit: "ppm" }, { symbol: "Pb", unit: "ppm" }, { symbol: "AuEq", unit: "ppm", custom: true, asSupplied: true }];
const rows = () => [
  { hole_id: "DH-23-001", from: 0, to: 2, values: { Zn: 100, Pb: 50, AuEq: 0.4 } },
  { hole_id: "DH-23-001", from: 2, to: 4, values: { Zn: 300, Pb: 100, AuEq: 1.1 } },
];

test("#3923 a calculated element carries its formula and an inputs signature; it is current until an operand changes", () => {
  const assays = rows();
  const r = addCalculatedElement(assays, base, "ZnSum", "Zn+Pb", "ppm");
  assert.equal(r.element.calculated.expr, "Zn+Pb");
  assert.match(r.element.calculated.sig, /^[0-9a-z]+:2$/);
  const els = [...base, r.element];
  assert.deepEqual(staleCalculated(r.assays, els), []);
  assert.deepEqual(staleCalculated(r.assays.map((a, i) => (i ? { ...a, values: { ...a.values, AuEq: 9 } } : a)), els), [], "an element the formula does not read changes nothing");
  assert.deepEqual(staleCalculated(r.assays.map((a, i) => (i ? { ...a, values: { ...a.values, Zn: 301 } } : a)), els).map((e) => e.symbol), ["ZnSum"], "an operand changed");
  assert.deepEqual(staleCalculated([...r.assays, { hole_id: "DH-23-002", from: 0, to: 2, values: { Zn: 1, Pb: 1 } }], els).map((e) => e.symbol), ["ZnSum"], "a row added");
  assert.notEqual(calcInputsSignature(assays, "Zn+Pb", ["Zn", "Pb"]), calcInputsSignature(assays, "Zn", ["Zn", "Pb"]));
});

test("#3923 recalculate: the stored formula over the assays as they are; a row that lost an operand loses the value; the signature is current again; as-supplied columns untouched", () => {
  const r = addCalculatedElement(rows(), base, "ZnSum", "Zn+Pb", "ppm");
  const els = [...base, r.element];
  const changed = r.assays.map((a, i) => (i === 0 ? { ...a, values: { ...a.values, Zn: 150 } } : { ...a, values: { Pb: 100, AuEq: 1.1, ZnSum: 400 } }));
  assert.equal(staleCalculated(changed, els).length, 1);
  const again = recalculateElement(changed, els, r.element);
  assert.equal(again.assays[0].values.ZnSum, 200, "re-read: Zn is now 150");
  assert.equal(again.assays[1].values.ZnSum, undefined, "no Zn on this row now: no out-of-date number kept");
  assert.deepEqual([again.computed, again.skipped], [1, 1]);
  assert.equal(again.element.calculated.expr, "Zn+Pb");
  assert.deepEqual(staleCalculated(again.assays, els.map((e) => (e.symbol === "ZnSum" ? again.element : e))), []);
  assert.equal(again.assays[0].values.AuEq, 0.4, "an as-supplied column is left as it is");
  assert.deepEqual(staleCalculated(changed, base), [], "an element with no formula is never stale");
});

test("#3923 wiring: the Geochem panel shows the line and a Recalculate button", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const staleCalcs = useMemo\(\(\) => staleCalculated\(assays, assayElements\), \[assays, assayElements\]\);/);
  assert.match(g, /recalculateElement\(rows, assayElements\.map/);
  assert.match(g, /tr\("Recalculate"\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8")); assert.ok(j["Recalculate"] && j["The assays changed since {list} was calculated."], lang); }
});
