// TASKS.csv #1627 — the Boundaries and Claims help say what import does with a CRS (reprojected; none stated -> the project's, said).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("both texts describe the reprojection and the no-CRS case; neither says it is not reprojected", () => {
  const s = fs.readFileSync("src/modules/GeophysicsModule.jsx", "utf8");
  assert.equal((s.match(/Shapefile and GeoPackage are reprojected from their own CRS to the project's EPSG/g) || []).length, 2);
  assert.equal((s.match(/states no CRS is taken to be in the project's EPSG, and the import message says so/g) || []).length, 2);
  assert.doesNotMatch(s, /no on-import reprojection yet|Assumes the file's own coordinates already match/);
});
