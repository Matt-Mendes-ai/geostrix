// TASKS.csv #2579 — the target RL handed over from the score was the RL of the best sample anywhere within the card's 250 m reach: on a
// sheet dipping 35 degrees it was 50-74 m off at the cell. It now comes from the cell's own ground.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { targetElevation } from "../src/lib/evidenceSources.js";

const grid = { dx: 10, dy: 10 };
// a sheet dipping west: the point under the cell at RL 251, a richer one 203 m away at RL 136
const pts = [{ x: 4, y: 0, z: 251, value: 1.91 }, { x: -203, y: 0, z: 136, value: 2.09 }, { x: 28, y: 0, z: 149, value: 1.96 }];

test("the best point within two cells of the target, with its plan distance", () => {
  const t = targetElevation({ x: 0, y: 0 }, [{ pts, reach: 250 }], grid);
  assert.equal(t.from, "point");
  assert.equal(t.z, 149, "the richer of the two within 50 m (4 m and 28 m away), not the 2.09 point 203 m off");
  assert.equal(t.dist, 28);
  assert.equal(t.within, 50);
});

test("no point under the cell: the inverse-distance-squared mean RL of the points it reaches", () => {
  const t = targetElevation({ x: -100, y: 0 }, [{ pts, reach: 250 }], grid);
  assert.equal(t.from, "mean"); assert.equal(t.n, 3);
  const w = (d) => 1 / d ** 2, z = (w(104) * 251 + w(103) * 136 + w(128) * 149) / (w(104) + w(103) + w(128));
  assert.ok(Math.abs(t.z - z) < 1e-9, String(t.z));
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /return \{ pts: holeGradePoints\(gradeAssaysOf\(l\.kind === "pxrf" \? pxrfAssays : cleanAssays, l\), l\.ref,/); // the card's own holes
  assert.match(p, /zs\[k\]\?\.from === "mean" \? tr\("Opens Planned holes with this easting and northing as the target, at RL \{z\} m: no point/);
});
