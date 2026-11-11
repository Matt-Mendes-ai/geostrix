// TASKS.csv #2503 — QAQC quoted a converted limit as the lab's ('Use the lab's <0.004645329', the file said <0.01 % Li2O), and Thresholds
// guessed 'probably half the detection limit substituted before import' for values the file itself flagged '<' (drill qualifiers were
// not read as below detection at all).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatLimit, limitLooksConverted, suggestDetectionLimit, censoringFloor } from "../src/lib/qaqc.js";

test("limits print with four significant figures", () => {
  assert.equal(formatLimit(0.004645329), "0.004645");
  assert.equal(formatLimit(0.0023226645607841317), "0.002323");
  assert.equal(formatLimit(0.01), "0.01");
  assert.equal(formatLimit(2), "2");
  assert.equal(formatLimit(null), "");
  assert.equal(formatLimit(NaN), "");
});

test("a round limit is the lab's; one with more than two significant figures was converted", () => {
  for (const x of [0.01, 0.005, 2, 0.25, 0.001, 5, 10, 0.02]) assert.equal(limitLooksConverted(x), false, String(x));
  for (const x of [0.004645329, 0.003787018, 0.000819000819, 0.00423980327313]) assert.equal(limitLooksConverted(x), true, String(x));
  assert.equal(limitLooksConverted(0), false);
  assert.equal(limitLooksConverted(null), false);
});

test("the suggestion on a converted file is flagged as converted, on an oxide-basis import it is the lab's", () => {
  const conv = Array.from({ length: 30 }, (_, i) => ({ values: { Li: i < 20 ? 0.004645329 / 2 : 1 + i / 10 }, qualifiers: i < 20 ? { Li: "<" } : {} }));
  const s1 = suggestDetectionLimit(conv, "Li");
  assert.equal(s1.basis, "lt"); assert.equal(s1.limit, 0.004645329); assert.equal(limitLooksConverted(s1.limit), true);
  const ox = Array.from({ length: 30 }, (_, i) => ({ values: { Li: i < 20 ? 0.005 : 1 + i / 10 }, qualifiers: i < 20 ? { Li: "<" } : {} }));
  const s2 = suggestDetectionLimit(ox, "Li");
  assert.equal(s2.limit, 0.01); assert.equal(limitLooksConverted(s2.limit), false);
});

test("Thresholds: flagged '<' values are below detection; the floor guess runs only on the unflagged ones", () => {
  const src = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(src, /const flaggedLt = \(s\) => !!s\.bdl\?\.includes\(symbol\) \|\| s\.qualifiers\?\.\[symbol\] === "<";/);
  assert.match(src, /censoringFloor\(data\.filter\(\(s\) => !flaggedLt\(s\)\)/);
  assert.match(src, /censoredOf: \(s\) => flaggedLt\(s\) \|\|/);
  assert.match(src, /floor: formatLimit\(floor\.floor\), unit, dl: formatLimit\(floor\.dl\)/);
  // the WA case: every floor value carries the '<' flag, so no floor is left to guess about
  const data = Array.from({ length: 100 }, (_, i) => ({ values: { Li: i < 30 ? 0.0023226645607841317 : 0.5 + i / 100 }, qualifiers: i < 30 ? { Li: "<" } : {} }));
  const flagged = (s) => s.qualifiers?.Li === "<";
  assert.ok(censoringFloor(data.map((s) => s.values.Li)), "without the flag the floor guess fires");
  assert.equal(censoringFloor(data.filter((s) => !flagged(s)).map((s) => s.values.Li)), null, "with it, nothing to guess");
});

test("QAQC wires the converted wording and the formatted limits; locale keys", () => {
  const src = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /limitLooksConverted\(dlSuggestion\.limit\) \? tr\("Use <\{limit\} \(the '<' results, converted at import\)"/);
  assert.match(src, /tr\("Use the lab's <\{limit\}", \{ limit: formatLimit\(dlSuggestion\.limit\) \}\)/);
  assert.match(src, /dl: formatLimit\(dl\), unit: unitL/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["Use <{limit} (the '<' results, converted at import)"], l);
  }
});
