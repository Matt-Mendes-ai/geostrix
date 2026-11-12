// TASKS.csv #2042 (review #2013, Woodjam) — unticking the Figure overlay's Legend relabelled it 'Legend (nothing switched on)' although
// nine layers were on: the groups were built only while the legend was ticked, so the count fell to 0. They are now built whenever the
// overlay is on; only the drawing follows the tick.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2042 the legend groups do not depend on the Legend tick; the overlay draws them only when it is on", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const i = v.indexOf("const overlayLegendGroups = useMemo(() => {");
  const body = v.slice(i, v.indexOf("}, [", i));
  assert.match(body, /if \(!figureOverlay\.enabled\) return \[\];/);
  assert.ok(!body.includes("figureOverlay.legend"));
  assert.ok(!v.slice(v.indexOf("}, [", i), v.indexOf("]);", v.indexOf("}, [", i))).includes("figureOverlay.legend"), "not a dependency either");
  assert.match(v, /legendGroups=\{figureOverlay\.legend \? overlayLegendGroups : \[\]\}/);
});
