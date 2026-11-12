// TASKS.csv #2727 (split from #1846) — Surface query lists block models too: on Holes, the metres each hole runs in the model and at or
// above a cutoff (Evaluate onto drillholes' sampling); on Point, the block's value there against the cutoff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holesInBlockModel, sampleModelOnHoles, buildVoxelLookup } from "../src/lib/voxelSample.js";

// a column of 10 m blocks over a vertical hole at x = 5, y = 5: values 1..6 from the top down
const cells = Array.from({ length: 6 }, (_, k) => ({ x: 5, y: 5, z: 95 - 10 * k, dx: 10, dy: 10, dz: 10, value: k + 1 }));
const model = { cells };
const collars = [{ hole_id: "H1", x: 5, y: 5, z: 100, max_depth: 80, azimuth: 0, dip: 90 }]; // dip 90 = straight down (GeoStrix convention)

test("per hole: metres in the model and at or above a cutoff, with their mean", () => {
  const { rows } = sampleModelOnHoles({ model, collars, survey: [], desurveyMethod: "tangential" });
  const [h] = holesInBlockModel(rows, 4);
  assert.equal(h.hole_id, "H1");
  assert.ok(Math.abs(h.inM - 60) < 0.6, "60 m of blocks: " + h.inM);
  assert.ok(Math.abs(h.aboveM - 30) < 0.6, "values 4, 5, 6: 30 m: " + h.aboveM);
  assert.ok(Math.abs(h.meanAbove - 5) < 0.1, "their mean: " + h.meanAbove);
  assert.equal(holesInBlockModel(rows, null)[0].aboveM, null, "no cutoff: no above column");
});

test("the block at a point", () => {
  const L = buildVoxelLookup(cells);
  assert.equal(L.find(5, 5, 72).value, 3);
  assert.equal(L.find(50, 5, 72), null);
});

test("the dialog wires the block models in", () => {
  const m = readFileSync(new URL("../src/components/SurfaceQueryModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const blockModels = useMemo\(\(\) => \(voxelModels \|\| \[\]\)\.filter\(\(m\) => \(m\.cells \|\| \[\]\)\.length && m\.colorMode !== "discrete"\)/);
  assert.match(m, /sampleModelOnHoles\(\{ model: bm, collars, survey, desurveyMethod \}\)\.rows/);
  assert.match(m, /holesInBlockModel\(bmHoles, bmCutoff\)/);
  assert.match(m, /bmLookup\.find\(p\.x, p\.y, p\.z\)/);
});
