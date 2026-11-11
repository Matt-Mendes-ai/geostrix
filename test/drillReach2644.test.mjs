// TASKS.csv #2644 — a drillhole card's default Reach is twice the drill-site spacing (50-1,000 m), 250 m when unknown
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { medianSiteSpacing } from "../src/lib/evidenceSources.js";

test("a 25 m drill grid gives a 50 m reach, not 250 m", () => {
  const collars = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) collars.push({ hole_id: `H${i}_${j}`, x: i * 25, y: j * 25, z: 0 });
  const s = medianSiteSpacing(collars);
  assert.ok(Math.abs(s - 25) < 1, String(s));
  assert.equal(Math.round(Math.min(1000, Math.max(50, 2 * s))), 50);
});

test("the pane uses it for the reach, the first compute, the grid pad and the cards' points", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.ok(p.includes("const drillReach = siteSpacing > 0 ? Math.round(Math.min(1000, Math.max(50, 2 * siteSpacing))) : DRILL_REACH_M;"));
  assert.ok(p.includes('src.kind === "grade" || src.kind === "pxrf" || src.kind === "numeric" ? { reach: drillReach }'));
  assert.ok(!/opts\.reach \|\| DRILL_REACH_M/.test(p) && !/l\.reach \|\| DRILL_REACH_M/.test(p));
});
