// TASKS.csv #4094 — Edinburgh Park's soil table (a GSQ sample) keeps its standards and duplicates at one place; a medium whose points have no neighbour except
// ones on the very same spot made medianSpacing search ever wider rings (up to 1e4, ~1e12 cells) and hung the 3D View for minutes. The search now stops where the grid ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { medianSpacing } from "../src/lib/viewer/surfaceSymbols.js";

test("points all on one spot have no spacing, and the answer comes at once", () => {
  const t0 = Date.now();
  assert.equal(medianSpacing(Array.from({ length: 60 }, () => [554721, 7783796])), Infinity);
  assert.ok(Date.now() - t0 < 1000, "no ring search over the whole of the 1e4 rings");
});

test("many coincident points beside a few others: the spacing is to the others", () => {
  const pts = [...Array.from({ length: 40 }, () => [100, 100]), [200, 100], [100, 300]];
  const t0 = Date.now(), d = medianSpacing(pts);
  assert.ok(Number.isFinite(d) && d >= 100 && d <= 200, String(d));
  assert.ok(Date.now() - t0 < 1000);
});

test("a regular grid keeps its spacing", () => {
  const pts = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) pts.push([i * 10, j * 10]);
  assert.equal(medianSpacing(pts), 10);
  assert.equal(medianSpacing([[0, 0]]), Infinity);
});
