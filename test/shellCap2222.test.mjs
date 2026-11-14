// TASKS.csv #2222 (review #2174, WA gold) — the grade shell pane makes the Estimation dialog's default-cap decision (#1573): CV > 150 % starts
// capped at the length-weighted P99, an emptied field runs uncapped and says so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lengthWeightedPercentile, elementCvPct, CAP_CV_PCT } from "../src/lib/geochem.js";

// a nuggety gold population: 97 samples of 0.2 g/t and three bonanza grades
const assays = [];
for (let i = 0; i < 97; i++) assays.push({ hole_id: "A", from: i, to: i + 1, values: { Au: 0.2 } });
assays.push({ hole_id: "A", from: 97, to: 98, values: { Au: 700 } }, { hole_id: "A", from: 98, to: 99, values: { Au: 120 } }, { hole_id: "A", from: 99, to: 100, values: { Au: 40 } });

test("the CV is the Estimation dialog's (sample stdev / mean); a bonanza population passes the 150 % screen", () => {
  const cv = elementCvPct(assays, "Au");
  const vals = assays.map((a) => a.values.Au), mean = vals.reduce((t, v) => t + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((t, v) => t + (v - mean) ** 2, 0) / (vals.length - 1));
  assert.ok(Math.abs(cv - (100 * sd) / mean) < 1e-9);
  assert.ok(cv > CAP_CV_PCT);
  assert.equal(elementCvPct(assays.slice(0, 2), "Au"), null);
  assert.ok(elementCvPct(assays.slice(0, 97), "Au") < 1); // a flat population: no cap
  const p99 = lengthWeightedPercentile(assays, "Au", "g/t", { Au: "g/t" }, 99);
  assert.ok(p99 > 0.2 && p99 <= 700, String(p99));
});

test("the same decision and wording as the Estimation dialog; wired under the shell's cap field", () => {
  const n = readFileSync(new URL("../src/modules/viewer/ShellCapNote.jsx", import.meta.url), "utf8");
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  const key = "Capped at P99 = {cap} by default: this element's coefficient of variation is {cv}%. Clear the cap to run uncapped; the result says which.";
  assert.ok(n.includes(key) && e.includes(key));
  assert.match(e, /if \(!\(elementCV > 150\)\)/);
  assert.match(n, /lengthWeightedPercentile\(src, symbol, unit, units, 99\)/);
  assert.match(n, /if \(own && !has\) return; \/\/ set once for this element: an emptied field stays empty/); // #3272 — own = auto.current.symbol === symbol
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<ShellCapNote assays=\{shellAreaAssays \/\* #3272 — the holes the run uses \*\/\} symbol=\{sym\} unit=\{unit\} assayElements=\{assayElements\} includeQAQC=\{numericIncludeQAQC\} isAssay=\{!numSrc && symbols\.includes\(sym\)\} capValue=\{numericCapValue\} setCapValue=\{setNumericCapValue\} autoRef=\{shellCapAuto \/\* #3272 \*\/\} \/>/);
});
