// TASKS.csv #1736 / #1737 (review #1645, Copley) — a cap belongs to its element; a block model is named from its own result
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const est = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");

test("Estimation: changing the element clears the cap and the old result; a capped run says so", () => {
  assert.ok(est.includes("onChange={(e) => { setSymbol(e.target.value); setCapValue(NaN); setResult(null); }}"));
  // TASKS.csv #3271 — in a set the line names the capped element; alone, as before
  assert.ok(est.includes('result.params?.capValue != null && <div>{result.members?.length ? tr("{el} capped at {cap} {unit} before estimating."'));
  assert.ok(est.includes(': tr("Grades capped at {cap} {unit} before estimating."'));
});

test("Estimation: models are named from the result's own element / method / cell", () => {
  assert.ok(est.includes("p.element ? `${p.element} estimate (${p.method}, ${c}m${r}${a}${w}${h}${dn})`")) // ${dn}: ", by <domain layer>" for a hard boundary, #3014 // #2069: and the restricting solid / checked holes; // ${r}: the search radius, #1752; ${a}: the trend, #2423
  assert.equal(est.split("resultName()").length - 1, 5, "grade, support index and kriging variance models, the name box's placeholder, and the grade-tonnage table (#1577)");
});

test("Grade shell: the cap is cleared and the cutoff re-proposed (P90 of lab assays) on an element change", () => {
  assert.ok(panes.includes("setNumericSymbol(next); setNumericCapValue(NaN);"));
  // #3272 — the proposal is one function (the element change and the opening element), over the holes the run uses
  assert.ok(panes.includes("proposeShellCutoff(next); // #3272"));
  assert.ok(panes.includes('(numericIncludeQAQC ? inArea.filter((a) => a.source !== "pXRF") : excludeQAQC(inArea))')); // #1741 — a downhole log stands in for the assays; #2060 — QC left out (excludeQAQC drops pXRF too)
  assert.ok(panes.includes("rowsFor.map((a) => a.values?.[ns ? ns.symbol : next])"));
});

test("#1737 — the name box suggests the name the result will get, not the form's current settings", () => {
  const src = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.ok(src.includes('placeholder={modelName.trim() ? "" : resultName()'));
  assert.ok(!src.includes('placeholder={tr("{symbol} estimate ({method}, {cellSize}m)"'));
});
