// TASKS.csv #1727 (review #1645, Copley) — a drill-only evidence overlay says it ranks drilled ground, and its grid grows with the reach
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRILL_REACH_M } from "../src/lib/evidenceSources.js";

test("#1727 the pane pads the drilling extent by the largest drillhole reach and says when every evidence is from the holes", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('const drillPad = useMemo(() => Math.max(DRILL_REACH_M, ...layers.filter((l) => l.kind === "grade" || l.kind === "pxrf").map((l) => Number(l.reach) || 0)), [layers]);'));
  assert.ok(p.includes("all.grow(p.x - drillPad, p.y - drillPad, p.x + drillPad, p.y + drillPad)"), "the extent uses the pad, not the fixed reach");
  assert.ok(p.includes("geophysPts, voxelModels, drillPad]);"), "the extent memo re-runs when the pad changes");
  assert.ok(p.includes('const drillOnly = layers.length > 0 && layers.every((l) => l.kind === "grade" || l.kind === "pxrf" || l.kind === "pick");'));
  assert.ok(p.includes("it ranks drilled ground, not untested targets"));
  assert.equal(DRILL_REACH_M, 250);
});
