// TASKS.csv #1630 — typed range rounded, 'A file' targets the project CRS, contour sets at their own levels.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the three fixes are wired", () => {
  const r = fs.readFileSync("src/components/RasterColourControls.jsx", "utf8");
  assert.match(r, /min: sig4\(range\[0\]\), max: sig4\(range\[1\]\)/);
  assert.match(r, /const sig4 = \(v\) => \(Number\.isFinite\(v\) && v !== 0 \? Number\(v\.toPrecision\(4\)\) : v\);/);
  assert.match(fs.readFileSync("src/modules/CartographyModule.jsx", "utf8"), /const \[fileTo, setFileTo\] = useState\(\(\) => \(project\?\.crsSet !== false && project\?\.epsg \? project\.epsg : null\)\);/);
  assert.match(fs.readFileSync("src/modules/GeophysicsModule.jsx", "utf8"), /\{b\.useVertexZ \? \(/);
  assert.equal(Number((0.0005000000237487257).toPrecision(4)), 0.0005);
  assert.equal(Number((1.1027064323425293).toPrecision(4)), 1.103);
});
