// TASKS.csv #2976 (review #2876, WA iron) — Planned hole checks flagged six of ten infill holes on a 23 m pattern against a fixed 'Min. spacing
// (m) 25'. The minimum starts at a quarter of the drilled holes' site spacing, said under the field, and none without drilling.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { minSpacingFrom } from "../src/lib/plannedHoleChecks.js";
import { drilledSiteSpacing } from "../src/lib/evidenceSources.js";

test("a quarter of the drilled holes' site spacing", () => {
  const collars = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) collars.push({ hole_id: `H${i}_${j}`, x: i * 23, y: j * 23 });
  const s = drilledSiteSpacing(collars);
  assert.ok(Math.abs(s - 23) < 0.5, `site spacing ${s}`);
  assert.equal(minSpacingFrom(s), 5.8);
  // an infill hole at the centre of a cell (16.3 m from four collars) is not flagged
  assert.ok(Math.hypot(11.5, 11.5) > minSpacingFrom(s));
  assert.equal(minSpacingFrom(null), null);
  assert.equal(minSpacingFrom(0), null);
});

test("the pane: no fixed 25 m, the source said, none flags nothing", () => {
  const p = fs.readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(!p.includes("useState(25)"));
  assert.ok(p.includes("const autoMin = minSpacingFrom(siteSpacing);"));
  assert.ok(p.includes("Min. spacing: a quarter of the drilled holes' site spacing ({s} m). Type your own."));
  // #3336 — off the pad: the nearest-hole flag; on a shared pad, also a pad hole still inside the minimum at the toe
  assert.ok(p.includes("const offClose = minSpacing > 0 && !!nearestReal && nearestReal.distance < minSpacing;"));
  assert.ok(p.includes("const tooClose = offClose || padTooClose;"));
});
