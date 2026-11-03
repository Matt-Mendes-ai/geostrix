// TASKS.csv #1736 / #1737 (review #1645, Copley) — a cap belongs to its element; a block model is named from its own result
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const est = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");

test("Estimation: changing the element clears the cap and the old result; a capped run says so", () => {
  assert.ok(est.includes("onChange={(e) => { setSymbol(e.target.value); setCapValue(NaN); setResult(null); }}"));
  assert.ok(est.includes('result.params?.capValue != null && <div>{tr("Grades capped at {cap} {unit} before estimating."'));
});

test("Estimation: models are named from the result's own element / method / cell", () => {
  assert.ok(est.includes("p.element ? `${p.element} estimate (${p.method}, ${c}m)`"));
  assert.equal(est.split("resultName()").length - 1, 3, "grade, support index and kriging variance models");
});

test("Grade shell: the cap is cleared and the cutoff re-proposed (P90 of lab assays) on an element change", () => {
  assert.ok(panes.includes("setNumericSymbol(next); setNumericCapValue(NaN);"));
  assert.ok(panes.includes('.filter((a) => a.source !== "pXRF").map((a) => a.values?.[next])'));
});
