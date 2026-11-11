// TASKS.csv #2125 — a raster 409 km from the project made the plan's Fit span 410 km with the drilling a 40 px smudge, and its notice said
// '5 m above the highest collar under it' with no collar under it (the notice part: test/landingCheck2590.test.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planDataExtent, planFarLayers } from "../src/lib/mapsPlan.js";

const collars = [{ x: 602480, y: 5800000 }, { x: 634824, y: 5830000 }];
const wrongZone = { name: "wrongzone_9n.tif", bbox: [201592, 5810000, 202629, 5811000] };
const onProject = { name: "deerhorn_rgb.tif", bbox: [610000, 5805000, 611000, 5806000] };

test("Fit frames the drilling and the layers near it; a far raster, map layer or boundary is left out and named", () => {
  const e = planDataExtent({ rasters: [wrongZone, onProject], collars });
  assert.deepEqual(e, [602480, 5800000, 634824, 5830000]);
  const far = planFarLayers({ rasters: [wrongZone, onProject], collars, boundaries: [{ name: "iplines_9n", polylines: [[{ x: 201000, y: 5800000 }, { x: 202000, y: 5801000 }]] }] });
  assert.deepEqual(far.map((l) => [l.kind, l.name, Math.round(l.far.distM / 1000)]), [["raster", "wrongzone_9n.tif", 400], ["boundary", "iplines_9n", 400]]);
  // no collars: nothing is 'far', everything is framed (as before)
  assert.deepEqual(planDataExtent({ rasters: [wrongZone, onProject] }), [201592, 5805000, 611000, 5811000]);
  assert.deepEqual(planFarLayers({ rasters: [wrongZone] }), []);
  // a hidden layer is neither framed nor named
  assert.deepEqual(planFarLayers({ rasters: [{ ...wrongZone, visible: false }], collars }), []);
});

test("the plan says what Fit leaves out", () => {
  const src = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(src, /const farLayers = useMemo\(\(\) => planFarLayers\(/);
  assert.match(src, /tr\("Fit frames the drillholes and leaves out \{n\} layer\(s\) far from them: \{names\}\."/);
});
