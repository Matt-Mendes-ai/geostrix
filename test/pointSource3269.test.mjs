// TASKS.csv #3269 (Galore Creek review) — specific gravity as an estimation source: the default 2 m compositing at 50 % coverage threw away 141
// of 144 measurements (~0.11 m pieces, each window 5 % covered) with '0 dropped', and the density model rested on three values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compositeDownhole } from "../src/lib/geochem.js";

const pieces = (n, step, len) => { const out = []; for (let h = 0; h < 3; h++) for (let i = 0; i < n; i++) out.push({ hole_id: `H${h}`, from: i * step, to: i * step + len, values: { SG: 2.6 + (i % 5) * 0.05 } }); return out; };

test("compositeDownhole counts the readings no kept composite took (opts.stats)", () => {
  const st = {};
  assert.equal(compositeDownhole(pieces(20, 3, 0.11), "SG", "g/cc", {}, { length: 2, minCoverage: 0.5, stats: st }).length, 0);
  assert.deepEqual(st, { readings: 60, leftOut: 60 });
  const st0 = {};
  assert.equal(compositeDownhole(pieces(20, 3, 0.11), "SG", "g/cc", {}, { length: 2, minCoverage: 0, stats: st0 }).length, 60);
  assert.deepEqual(st0, { readings: 60, leftOut: 0 });
  // contiguous 1 m assays: every reading in a kept 2 m composite
  const stA = {};
  compositeDownhole(pieces(20, 1, 1), "SG", "g/cc", {}, { length: 2, minCoverage: 0.5, stats: stA });
  assert.deepEqual(stA, { readings: 60, leftOut: 0 });
  // and without opts.stats the result is the same array as before
  assert.deepEqual(compositeDownhole(pieces(20, 1, 1), "SG", "g/cc", {}, { length: 2, minCoverage: 0.5 }), compositeDownhole(pieces(20, 1, 1), "SG", "g/cc", {}, { length: 2, minCoverage: 0.5, stats: {} }));
});

test("wiring: a source of readings under a quarter of the composite is not composited, said; readings under coverage counted; the record", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const compositingSkipped = useComposites && readMedian != null && readMedian < compositeLength \/ 4 \? \{ medianM: readMedian, lengthM: compositeLength \} : null;/);
  assert.match(m, /if \(useComposites && !compositingSkipped\) \{\s*(\/\/[^\n]*\n\s*)?intervals = await compositeDownholeSliced\(runAssays, symbol, unit, elementUnits, \{\s*stats: coverageStats,/);
  assert.match(m, /composited: useComposites && !compositingSkipped,/);
  assert.match(m, /\{result\.compositingSkipped && <div role="note">\{tr\("Not composited: the readings are \{m\} m long \(median\)/);
  assert.match(m, /\{result\.coverageLeftOut && <div role="note"/);
  // no composite kept: the run says the coverage left every reading out, not 'check that holes have collars' (found live)
  assert.match(m, /if \(!points\.length && !intervals\.length && coverageStats\.readings > 0 && coverageStats\.leftOut === coverageStats\.readings\) \{ setError\(tr\("All \{n\} readings were left out/);
  assert.ok(m.indexOf("All {n} readings were left out") < m.indexOf("No sample points could be placed in 3D"));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["{k} of the {n} readings were left out: every composite they fell in was under the minimum coverage ({c} %).",
      "All {n} readings were left out: every composite they fell in was under the minimum coverage ({c} %). Lower the minimum coverage, or untick compositing to estimate the readings as they are."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
