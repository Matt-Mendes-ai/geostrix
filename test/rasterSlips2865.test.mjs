// TASKS.csv #2865 (review GSC geophysics) — Maps raster slips: Source CRS forgotten on a tab change, the filter select wider than the card,
// the same file imported twice unasked, 'contours (10, 50, 100 )' with no unit
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("the four slips", () => {
  const r = fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.ok(r.includes("useState(() => keptSourceEpsg)") && r.includes("keptSourceEpsg = sourceEpsg;"));
  assert.ok(r.includes('minWidth: 0, width: "100%" /* #2865'));
  assert.ok(r.includes("if (sameRaster(raster, rasters) && !window.confirm("));
  const g = fs.readFileSync(new URL("../src/components/GridContourControls.jsx", import.meta.url), "utf8");
  assert.ok(g.includes('tr("{name} contours ({levels}{unit})", { name: raster.name, levels: res.map((l) => l.level).join(", "), unit: unit ? ` ${unit}` : "" })'));
});
