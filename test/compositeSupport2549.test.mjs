// TASKS.csv #2549 — a downhole variogram on 1 m composites reported a 0 % nugget: half the samples were 2-5 m long and each was cut into
// identical 1 m pieces. The dialogs now say when the composite is shorter than a material share of the samples, and offer their median.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compositeVsSamples, COMPOSITE_SHORT_SHARE } from "../src/lib/compositeSupport.js";

// the review's mix: 9,980 of 1 m, 4,964 RC of 2.5 m, ~5,000 aircore of 2-5 m (scaled down 1:100)
const assays = [];
const add = (n, len) => { for (let k = 0; k < n; k++) assays.push({ from: 0, to: len, values: { Li: 1 } }); };
add(100, 1); add(50, 2.5); add(20, 2); add(15, 3); add(15, 5);

test("a 1 m composite on the review's mix: 74 % of the sampled metres are in longer samples; the length-weighted median suggests 2.5 m", () => {
  const r = compositeVsSamples(assays, "Li", 1);
  assert.equal(r.n, 200);
  assert.ok(Math.abs(r.longer - 285 / 385) < 1e-9, String(r.longer)); // 100 x 1 m, 50 x 2.5, 20 x 2, 15 x 3, 15 x 5 = 385 m
  assert.ok(r.longer >= COMPOSITE_SHORT_SHARE);
  assert.equal(r.medianM, 2.5); assert.equal(r.proposalM, 2.5);
  // at 2.5 m only the 3 m and 5 m samples are longer: 120 of 385 m
  assert.ok(Math.abs(compositeVsSamples(assays, "Li", 2.5).longer - 120 / 385) < 1e-9);
  // never a suggestion shorter than the composite it replaces
  assert.equal(compositeVsSamples(assays, "Li", 3).proposalM, 3);
});

test("samples without the element, without length, or an unset composite are not counted", () => {
  const r = compositeVsSamples([...assays, { from: 5, to: 5, values: { Li: 1 } }, { from: 0, to: 9, values: { Cu: 1 } }], "Li", 1);
  assert.equal(r.n, 200);
  assert.equal(compositeVsSamples(assays, "Li", 0), null);
  assert.equal(compositeVsSamples([], "Li", 1), null);
  assert.equal(compositeVsSamples([{ from: 0, to: 1.04, values: { Li: 1 } }], "Li", 1).longer, 0, "within 5 % is the same length");
});

test("both dialogs show the note under their composite length, with a button to use the suggestion", () => {
  for (const f of ["VariogramModal", "GradeEstimationModal"]) {
    const s = readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8");
    assert.match(s, /<CompositeLengthNote assays=\{srcAssays\} symbol=\{symbol\} length=\{compositeLength\}/, f);
  }
  const c = readFileSync(new URL("../src/components/CompositeLengthNote.jsx", import.meta.url), "utf8");
  assert.match(c, /c\.longer < COMPOSITE_SHORT_SHARE\) return null/);
  assert.match(c, /tr\("Use \{m\} m", \{ m: c\.proposalM \}\)/);
});
