// TASKS.csv #1430 — Quantile on a recovered susceptibility (most cells at the 0 bound) gave 'to 0 | to 0 | ...': empty classes. Equal
// breaks are merged now, and the editors say how many classes the data could hold.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyBreaks, classCountNote } from "../src/lib/layers.js";

const sus = [...Array(600).fill(0), ...Array.from({ length: 400 }, (_, i) => (i + 1) * 0.000028)]; // 60 % at the 0 bound, max 0.0112

test("Quantile merges the breaks that fall on the same value; the result ascends strictly", () => {
  const b = classifyBreaks(sus, 5, "quantile");
  assert.ok(b.every((v, i) => i === 0 || v > b[i - 1]), JSON.stringify(b));
  assert.equal(b[0], 0);
  assert.ok(b.length < 5, JSON.stringify(b));
  assert.match(classCountNote(b, 5, "quantile"), new RegExp(`^${b.length} of the 5 classes: many values are equal`));
});

test("no note when every class came out; the other methods keep their classes", () => {
  const v = Array.from({ length: 500 }, (_, i) => 1 + i * 0.37);
  for (const m of ["equal", "quantile", "normal", "jenks", "log"]) {
    const b = classifyBreaks(v, 5, m);
    assert.equal(b.length, 5, m); assert.equal(classCountNote(b, 5, m), "", m);
  }
});

test("both legend editors show the note under Apply", () => {
  for (const f of ["../src/modules/GeophysicsModule.jsx", "../src/components/NumericSymbologyEditor.jsx"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(s, /setClassNote\(classCountNote\(breaks, classCount, method\)\)/, f);
    assert.match(s, /\{classNote && <div /, f);
  }
});
