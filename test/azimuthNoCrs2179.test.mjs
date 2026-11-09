// TASKS.csv #2179 — no north conversion with the placeholder CRS, and no dialog names the placeholder as the project CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pipe = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const modal = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("true / magnetic north and another CRS's grid are left as they are while the project CRS is not chosen", () => {
  const body = pipe.slice(pipe.indexOf("const applyAzimuthRef = (rows, locate) => {"), pipe.indexOf("if (!azimuthRef || azimuthRef === \"grid\") return applyGridOf(rows, locate);"));
  assert.ok(body.includes("const crsUnset = (importStateRef.current.project || project)?.crsSet === false;"));
  assert.ok(body.includes('const converting = (azimuthRef && azimuthRef !== "grid") || (azimuthGridEpsg && target !== "collars");'));
  assert.ok(body.includes("if (crsUnset && converting && rows.some((r) => Number.isFinite(r.azimuth))) return { rows, note: tr("));
});

test("the Grid-of default and the local-grid help say the CRS is not chosen yet", () => {
  assert.ok(modal.includes('defaultText={crsUnset ? tr("The project CRS — not chosen yet")'));
  assert.ok(modal.includes("(crsUnset ? tr(\"— the same place on both grids (surveyed pins, a re-located hole), with project coordinates in the project CRS, which isn't chosen yet"));
});
