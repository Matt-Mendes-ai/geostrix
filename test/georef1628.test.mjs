// TASKS.csv #1628 — three control points are an exact fit (no error to show); RMSE in metres; the raster named after its file.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fitAffine, residuals } from "../src/lib/georef.js";

test("any three points fit an affine exactly (zero residuals), so 0.00 says nothing", () => {
  const pts = [{ id: 1, px: 10, py: 20, x: 605700, y: 6351900 }, { id: 2, px: 400, py: 35, x: 608300, y: 6352200 }, { id: 3, px: 220, py: 300, x: 607000, y: 6350100 }];
  const r = residuals(fitAffine(pts), pts);
  assert.ok(r.every((q) => q.error < 1e-6));
});

test("the modal says so, gives RMSE in metres on a metric CRS, and names the result after the file", () => {
  const s = fs.readFileSync("src/components/GeoreferencerModal.jsx", "utf8");
  assert.match(s, /fitResiduals\.length === 3/);
  assert.match(s, /isMetricProjectedEpsg\(projectEpsg\) \? tr\("Transform fit — RMSE \{rmse\} m\."/);
  assert.match(s, /name: fileStem \? `\$\{fileStem\} \(georeferenced\)` : "Georeferenced scan"/);
});
