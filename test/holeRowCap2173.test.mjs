// TASKS.csv #2173 — the sidebar lists the holes HOLE_ROWS_STEP at a time (10,544 rows made 265,000 page elements, 0.5 s per layout), and the
// ribbon and the on-screen legend no longer force a layout on every render
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vm = rd("../src/modules/ViewerModule.jsx"), parts = rd("../src/modules/viewer/ViewerParts.jsx");
const ribbon = rd("../src/components/Ribbon.jsx"), overlay = rd("../src/components/ViewportFigureOverlay.jsx");

test("the hole list is capped, with Show more, and starts again on a new filter", () => {
  assert.ok(vm.includes("<HoleRowList holes={tickedShown(collars, holeFilter)} filterKey={JSON.stringify(holeFilter)}"));
  assert.ok(!vm.includes("tickedShown(collars, holeFilter).map("));
  assert.ok(parts.includes("export const HOLE_ROWS_STEP = 300;"));
  assert.ok(parts.includes("{holes.slice(0, limit).map((c) => ("));
  assert.ok(parts.includes("useEffect(() => { setLimit(HOLE_ROWS_STEP); }, [filterKey]);"));
  assert.ok(parts.includes('tr("Show {n} more ({rest} not listed)"'));
});

test("no layout read on every render in the ribbon fit or the legend fit", () => {
  assert.ok(ribbon.includes("const key = `${mode}|${[...el.querySelectorAll(\".ge-ribbon-label\")].map((x) => x.textContent).join(\"|\")}`;"));
  assert.ok(!/const key = `\$\{mode\}\|\$\{el\.clientWidth\}/.test(ribbon));
  assert.ok(overlay.includes("}, [fit, legendKey, boxH, boxW, config.title, config.legend, config.enabled, showScale]);") /* boxW: #2044 */);
  assert.ok(overlay.includes("const k = Math.max(1, Math.ceil(over / 17)) * lay.cols, shownNow = Math.max(1, shownLenRef.current);"));
});
