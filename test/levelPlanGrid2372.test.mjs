// TASKS.csv #2372 (review #2325, WA uranium) — a level plan on a drilling grid (414 pierce points): the hole ids became a ring of labels with
// long leaders, some over the easting axis, in a plan 760 px wide in a 1,840 px window. Ids start off above 100 pierce points, a label
// moves at most 3 rows from its point, the axis labels are obstacles, and the plan scales to the window.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveLabels } from "../src/lib/sectionLabels.js";

test("resolveLabels' rings: a label with no room within that many rows is left out, not led across the plan", () => {
  // a crowd of obstacles around the point: the free spot is 6 rows down
  const obstacles = [];
  for (let r = -5; r <= 5; r++) for (let dx = -60; dx <= 60; dx += 10) obstacles.push({ x: 100 + dx, y: 100 + r * 13.5 + 5, w: 10, h: 13 });
  const spec = { key: "a", text: "NNA5086", size: 10.5, prio: 2, optional: true, cands: [{ x: 106, y: 95, anchor: "start" }] };
  assert.equal(resolveLabels([spec], obstacles, { rings: 3 }).length, 0, "3 rows: left out");
  const far = resolveLabels([spec], obstacles, {});
  assert.equal(far.length, 1, "the default 10 rows still reaches the free spot");
  assert.ok(far[0].leaderFrom, "with a leader");
});

test("wiring: the default by pierce points, the rings, the axis obstacles, the plan's width", () => {
  const w = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /const LABELS_AUTO_MAX = 100, LABEL_RINGS = 3;/);
  assert.match(w, /const labels = labelsPick \?\? nPierce <= LABELS_AUTO_MAX;/);
  assert.match(w, /\.\.\.axisBoxes\(\)\], \/\/ axis labels: #2372/);
  assert.match(w, /\{ bounds: \[2, W - 2\], yBounds: \[20, H - 2\], rings: LABEL_RINGS \}/);
  assert.match(w, /width: `min\(calc\(96vw - 30px\), calc\(\(94vh - 170px\) \* \$\{W \/ H\}\)\)`/);
  const n = w.indexOf("const nPierce"), ret = w.indexOf("if (!ready || !plan) return (");
  assert.ok(n > 0 && n < ret, "the hook sits above the shell's early return");
});
