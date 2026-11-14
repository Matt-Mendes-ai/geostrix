// TASKS.csv #3280 (1) (Galore review; Matt's decision) — a newly opened project's legend starts collapsed ('Legend (n rows)', one click
// opens it) when it would cover more than a quarter of the view; small legends open as now; the user's own choice holds.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const legendTooBig = new Function(`return ${src.match(/export const legendTooBig = (\(w, h, boxW, boxH\) => [^;]+);/)[1]}`)();
const legendFullSize = new Function(`return ${src.match(/export const legendFullSize = (\(groups\) => \{[^\n]+\});/)[1]}`)();

test("more than a quarter of the view's area collapses; less does not; no view measured yet, nothing collapses", () => {
  assert.equal(legendTooBig(480, 700, 1200, 700), true); // 336,000 px of 840,000: 40 %
  assert.equal(legendTooBig(250, 300, 1600, 800), false); // 6 %
  assert.equal(legendTooBig(250, 650, 1600, 800), false); // 13 %: the review's single column on a large view stays open
  assert.equal(legendTooBig(480, 700, 0, 0), false);
});

test("'would cover': the whole legend before it is cut to fit; the review's twelve groups (~85 rows) collapse on full HD and laptop views, ten rows never", () => {
  const groups = (sizes) => sizes.map((n, i) => ({ key: `g${i}`, items: Array.from({ length: n }, (_, k) => ({ label: `${k}` })) }));
  const review = groups([16, 14, 9, 8, 7, 7, 6, 5, 4, 3, 2, 1]); // 82 rows in twelve groups
  assert.deepEqual(legendFullSize(review), [250, (1 + 82 + 12) * 17 + 16]);
  for (const [w, h] of [[1614, 806], [974, 543]]) assert.equal(legendTooBig(...legendFullSize(review), w, h), true, `${w} x ${h}`); // full HD, a laptop
  assert.equal(legendTooBig(...legendFullSize(review), 2400, 1300), false, "a 2,400 x 1,300 view: 22 %, it fits beside the drawing");
  assert.equal(legendTooBig(...legendFullSize(groups([6, 4])), 974, 543), false);
  assert.deepEqual(legendFullSize([{ key: "r", ramp: {} }]), [250, 3 * 17 + 16]);
});

test("wiring: only shortly after an open, not after the user chose; a bar that opens it; a button that collapses it; the fit re-runs", () => {
  assert.match(src, /if \(auto\.current\.key !== openKey\) auto\.current = \{ key: openKey, until: Date\.now\(\) \+ LEGEND_AUTO_MS, user: false \};/);
  assert.match(src, /if \(!a\.user && Date\.now\(\) < a\.until && legendTooBig\(\.\.\.legendFullSize\(legendGroups\), boxW, boxH\)\) \{ a\.until = 0; setCollapsed\(true\); return; \}/);
  assert.match(src, /\{showLegend && collapsed && \(/);
  assert.match(src, /onClick=\{\(\) => toggleLegend\(false\)\}[^\n]*pointerEvents: "auto"/);
  assert.match(src, /tr\("Legend \(\{n\} rows\)", \{ n: itemTotal \+ allRamps\.length \+ images\.length \}\)/);
  assert.match(src, /onClick=\{\(\) => toggleLegend\(true\)\} aria-expanded=\{true\} aria-label=\{tr\("Collapse the legend"\)\}/);
  assert.equal((src.match(/showScale, collapsed\]\)/g) || []).length, 2);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /openKey=\{viewerUiStateSeq\} \/\* #3280 \(1\) \*\//);
});
