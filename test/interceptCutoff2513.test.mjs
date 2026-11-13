// TASKS.csv #2513 — Best intercepts keeps a typed cut-off when the new element has the same unit, resets only a suggestion or on a change
// of unit (#1387), and says what it did
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cutoffOnElementChange } from "../src/lib/interceptCutoff.js";

test("the review's case: 0.4645 typed for Li, Li2O in the same unit: kept, and said", () => {
  assert.deepEqual(cutoffOnElementChange({ cutoff: 0.4645, typed: true, fromUnit: "%", toUnit: "%", suggestion: 2 }), { cutoff: 0.4645, suggested: false, note: { kind: "kept", value: 0.4645 } });
});

test("a typed cut-off is not carried into another unit (#1387): reset to the suggestion, and said", () => {
  assert.deepEqual(cutoffOnElementChange({ cutoff: 0.5, typed: true, fromUnit: "g/t", toUnit: "ppm", suggestion: 300 }), { cutoff: 300, suggested: true, note: { kind: "reset", value: 300 } });
});

test("an untouched suggestion just follows the element, silently; a cut-off last used for the element comes back, said", () => {
  assert.deepEqual(cutoffOnElementChange({ cutoff: 2, typed: false, fromUnit: "%", toUnit: "%", suggestion: 0.5 }), { cutoff: 0.5, suggested: true, note: null });
  assert.deepEqual(cutoffOnElementChange({ cutoff: 2, typed: true, fromUnit: "%", toUnit: "ppm", kept: 150, suggestion: 300 }), { cutoff: 150, suggested: false, note: { kind: "restored", value: 150 } });
  assert.equal(cutoffOnElementChange({ cutoff: 150, typed: true, fromUnit: "ppm", toUnit: "ppm", kept: 150, suggestion: 300 }).note, null);
});

test("wired in Best intercepts, with the note beside the box", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /cutoffOnElementChange\(\{ cutoff, typed: suggested == null \|\| cutoff !== suggested, fromUnit: elementUnits\[symbol\], toUnit: elementUnits\[sym\]/);
  assert.match(b, /Cut-off \{v\} kept from \{from\} \(the same unit\)\./);
  assert.match(b, /setCutoff\((toStored\()?Number\(e\.target\.value\) \|\| 0\)?\); setSuggested\(null\); setCutoffNote\(null\);/); // #3221: toStored (typed in % when shown in %)
});
