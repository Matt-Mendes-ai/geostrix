// TASKS.csv #1445 (review #1352) — the surface-sample import asks for the project CRS when it was never chosen and the file declares none,
// as the dialog's hint promises ('GeoStrix asks on import'), with the samples' points for the 'they would land at' check.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wired: asked before the adopt step, only when unset, undeclared and not latitude / longitude", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  const i = g.indexOf("if (project?.crsSet === false && !project?.localGrid /* #2180 */ && !fromEpsg && !rowAt && !mineSrc /* #2684 */) {"), j = g.indexOf("const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: toEpsg, declaredEpsg: fromEpsg, fileName: modal.fileName, at: rowAt });");
  assert.ok(i > 0 && j > i);
  assert.ok(g.slice(i, j).includes("await requestProjectCrs(") && g.slice(i, j).includes("if (picked) toEpsg = Number(picked);"));
  assert.ok(g.includes("const commitSurfaceImport = async (modal) => {"));
  assert.ok(readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8").includes("or GeoStrix asks on import"), "the hint it now keeps");
});
