// TASKS.csv #2225 — a mesh on a local-grid project (CRS not set) exports as it is: no CRS asked, the stamp says so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { provenanceLines } from "../src/lib/meshExport.js";

test("the provenance names the CRS when there is one, and says 'not set (local grid)' when there is none", () => {
  assert.ok(provenanceLines("s", null, { epsg: 26910 }).includes("Project CRS: EPSG:26910"));
  const local = provenanceLines("s", null, { epsg: null, crsUnset: true });
  assert.ok(local.includes("Project CRS: not set (local grid, coordinates as imported)"));
  assert.ok(!local.some((l) => /EPSG:/.test(l)));
});

test("the implicit-surface export does not ask for a CRS while it is unset, and the VTK header says local grid", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("const epsg = crsUnset ? null : await ensureExportCrs(project); if (!crsUnset && !epsg) return;"));
  assert.ok(v.includes("const extra = { epsg, crsUnset,"));
  assert.ok(v.includes('${epsg ? `EPSG:${epsg}` : "local grid, no CRS"}'));
});
