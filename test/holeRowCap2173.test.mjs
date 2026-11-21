// TASKS.csv #2173 — the sidebar listed the holes HOLE_ROWS_STEP at a time (since #3893 a window of rows in its own scroll box) (10,544 rows made 265,000 page elements, 0.5 s per layout), and the
// ribbon and the on-screen legend no longer force a layout on every render
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vm = rd("../src/modules/ViewerModule.jsx"), parts = rd("../src/modules/viewer/ViewerParts.jsx");
const ribbon = rd("../src/components/Ribbon.jsx"), overlay = rd("../src/components/ViewportFigureOverlay.jsx");

test("the hole list stays bounded and starts again on a new filter (#3893: a scroll box drawing a window of rows replaced the 300-row step)", () => {
  assert.ok(vm.includes("<HoleRowList holes={tickedShown(collars, holeFilter, holeSets)} filterKey={JSON.stringify(holeFilter)}"));
  assert.ok(!vm.includes("tickedShown(collars, holeFilter).map("));
  assert.ok(parts.includes("export const HOLE_ROW_H = 26, HOLE_LIST_ROWS = 12, HOLE_LIST_OVERSCAN = 10;"));
  assert.ok(parts.includes("{holes.slice(start, end).map((c) => ("));
  assert.ok(parts.includes("}, [filterKey]); // a new filter starts again from the top"));
});

test("no layout read on every render in the ribbon fit or the legend fit", () => {
  assert.ok(ribbon.includes("const key = `${mode}|${textSizeNow}|${[...el.querySelectorAll(\".ge-ribbon-label\")].map((x) => x.textContent).join(\"|\")}`;")); // #3900: the text size, no layout read
  assert.ok(!/const key = `\$\{mode\}\|\$\{el\.clientWidth\}/.test(ribbon));
  assert.ok(overlay.includes("}, [fit, legendKey, boxH, boxW, config.title, config.legend, config.enabled, showScale, collapsed]);") /* boxW: #2044 */);
  assert.ok(overlay.includes("const k = Math.max(1, Math.ceil(over / 17)) * lay.cols, shownNow = Math.max(1, shownLenRef.current);"));
});
