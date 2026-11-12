// TASKS.csv #3015 (WA iron review) — the Variogram on near-vertical drilling: downhole first, the in-plane lag at the hole spacing, and no
// 'no spatial structure' from an all-pairs run that mixes the two scales
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verticalShare } from "../src/lib/variogram.js";

test("the share of near-vertical holes: collar and every survey station within 5°, dip of either sign", () => {
  const collars = [{ hole_id: "A", dip: 90 }, { hole_id: "B", dip: -88 }, { hole_id: "C", dip: 60 }, { hole_id: "D", dip: 90 }];
  const survey = [{ hole_id: "D", depth: 50, dip: 80 }, { hole_id: "A", depth: 50, dip: 87 }];
  assert.equal(verticalShare(collars, survey), 0.5); // A and B; C inclined, D bends to 80 at depth
  assert.equal(verticalShare([], []), 0);
});

test("wired: Downhole by default on vertical drilling, the plane lag, the weak-fit note", () => {
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /useState\(\(\) => \(verticalShare\(collars, survey\) >= 0\.9 \? "downhole" : "all"\)\)/);
  assert.match(v, /lag = Math\.max\(1, Math\.round\(sp\.medianM\)\);\s*nLagsUsed = Math\.min\(60, Math\.max\(nLags, Math\.ceil\(Math\.max\(x1 - x0, y1 - y0\) \/ 3 \/ lag\)\)\);/);
  assert.match(v, /\{fitWeak && vertical && result\.holeMode === "all" && \(/);
});
