// TASKS.csv #2262 — outcrop structures: no true / magnetic north conversion with the placeholder CRS, and no placeholder named as the CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");

test("the north conversion tests crsSet, not only the (placeholder) epsg", () => {
  assert.ok(s.includes("if (!dst || project?.crsSet === false) { setStructMsg({ ok: false, text: tr(\"The project has no coordinate system yet"));
});

test("the Map layers and structure CRS defaults say the CRS is not chosen yet", () => {
  assert.ok(s.includes('defaultText={project?.crsSet === false ? tr("From the file (.prj / GeoPackage), else the project CRS (not chosen yet)")'));
  assert.ok(s.includes('defaultText={project?.crsSet === false ? tr("The project CRS — not chosen yet")'));
});
