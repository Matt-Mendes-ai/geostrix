// TASKS.csv #1715 (review #1645, Copley) — a map layer far bigger than the project is clipped to the project area before reprojection
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLayer, projectClipBox } from "../src/lib/mapLayerBuild.js";

const square = (x, y, s = 100) => ({ parts: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]], attributes: { unit: "Q" } });

test("projectClipBox: the holes' box widened by its own size or 5 km", () => {
  assert.deepEqual(projectClipBox([{ x: 1000, y: 2000 }, { x: 1600, y: 2800 }]), [-4000, -3000, 6600, 7800]);
  assert.equal(projectClipBox([]), null);
});

test("features far from the project are left out and counted; none near gives { outside }", () => {
  const parsed = { geomType: "polygon", epsg: 26910, features: [square(1000, 1000), square(3000, 3000), square(90000, 90000), square(-80000, 5000)] };
  const L = buildLayer(parsed, { sourceName: "regional", projectEpsg: 26910, clipTo: [-4000, -3000, 6600, 7800] });
  assert.equal(L.features.length, 2);
  assert.deepEqual(L.clipped, { kept: 2, total: 4 });
  const far = buildLayer({ ...parsed, features: [square(90000, 90000)] }, { sourceName: "far", projectEpsg: 26910, clipTo: [-4000, -3000, 6600, 7800] });
  assert.equal(far.outside, 1);
  assert.equal(buildLayer(parsed, { sourceName: "noclip", projectEpsg: 26910 }).features.length, 4, "no project area: everything, as before");
});

test("the Surface Geology import clips to the collars and samples and says so", () => {
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("clipTo: projectClipBox([...(collars || []), ...(surfaceSamples || [])])"));
  assert.ok(s.includes("if (layer?.outside) {"));
});
