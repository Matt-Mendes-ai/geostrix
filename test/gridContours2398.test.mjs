// TASKS.csv #2398 (review #2325, WA uranium) — contours on any raster that keeps its grid (a TMI, an eU grid), decoded only when asked for
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the raster card offers contours on every gridded raster; the control decodes the grid on demand", () => {
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /\{r\.grid && <GridContourControls raster=\{r\}/);
  assert.doesNotMatch(r, /r\.grid && r\.geochem && <GridContourControls/);
  const g = readFileSync(new URL("../src/components/GridContourControls.jsx", import.meta.url), "utf8");
  assert.match(g, /const \[open, setOpen\] = useState\(!!raster\.geochem\);/);
  assert.match(g, /useMemo\(\(\) => \(open && raster\.grid\?\.values \? b64ToF32/);
  assert.match(g, /const unit = rasterUnitOf\(raster\)/); // #1858 — the same three units (lib/rasterMethod.js), a typed one first
});
