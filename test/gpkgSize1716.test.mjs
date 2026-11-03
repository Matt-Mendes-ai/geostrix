// TASKS.csv #1716 (review #1645, Copley) — a GeoPackage too big to read whole is refused before reading, with what to do
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkGpkgSize, GPKG_MAX_BYTES } from "../src/lib/gpkgSize.js";

test("791 MB refused with advice; a normal file passes", () => {
  assert.throws(() => checkGpkgSize({ name: "v_260529.gpkg", size: 791298048 }), /v_260529\.gpkg is 755 MB: .*Export just the tables and the area you need/);
  assert.doesNotThrow(() => checkGpkgSize({ name: "small.gpkg", size: 4e6 }));
  assert.equal(GPKG_MAX_BYTES, 300 * 1024 * 1024);
});

test("every GeoPackage reader checks the size before reading the file", () => {
  for (const [f, needle] of [["src/components/SurfaceMappingPanel.jsx", "checkGpkgSize(f); // #1716"], ["src/lib/viewer/importHelpers.js", "try { checkGpkgSize(file); }"], ["src/modules/GeophysicsModule.jsx", "checkGpkgSize(file); // #1716"]]) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(s.indexOf(needle) > 0 && s.indexOf(needle) < s.indexOf("arrayBuffer()", s.indexOf(needle) - 400) + 1000, f);
  }
});
