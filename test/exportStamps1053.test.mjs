// TASKS.csv #1053 (review #1016) — every model writer says "not a Mineral Resource" and states the CRS, in one wording
import { test } from "node:test";
import assert from "node:assert/strict";
import { provenanceLines, worldBoxOf } from "../src/lib/meshExport.js";
import { surfaceToVtk, blockModelToVtk } from "../src/lib/vtkExport.js";
import { NOT_A_RESOURCE } from "../src/lib/provenance.js";

test("surface stamp: provenance.js wording, version, the mesh's own box, an honest solve-grid extent", () => {
  const L = provenanceLines("Top of DACT", { tool: "GemPy", surface: "DACT", sourcePoints: 30, orientations: 4, extent: [0, 100, 0, 100, -50, 50], anisotropy: null },
    { epsg: 32609, appVersion: "9.9.9", worldBox: worldBoxOf([500000, 6000000, 100, 500100, 6000200, 300]) });
  assert.equal(L[0], NOT_A_RESOURCE);
  assert.ok(L[1].includes("GeoStrix 9.9.9"));
  assert.ok(L.includes("Project CRS: EPSG:32609"));
  assert.ok(L.some((l) => l === "Mesh extent (exported coordinates): E 500000.0 to 500100.0, N 6000000.0 to 6000200.0, elevation 100.0 to 300.0 m"));
  assert.ok(L.some((l) => l.startsWith("Solve-grid extent (internal frame") && l.includes("not the exported coordinates")));
  assert.equal(worldBoxOf([]), null);
});

test("VTK titles (surface and block model) lead with the statement and the CRS", () => {
  const s = surfaceToVtk("S", [[0, 0, 0], [1, 0, 0], [0, 1, 0]], [0, 1, 2], "v9.9.9 | EPSG:32609").split("\n")[1];
  assert.equal(s, "GeoStrix | not a Mineral Resource estimate | v9.9.9 | EPSG:32609 | S");
  const cells = [{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 1 }, { x: 15, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 2 }];
  const head = new TextDecoder().decode(blockModelToVtk({ name: "BM", cells }, "v9.9.9 | EPSG:32609").bytes.subarray(0, 200)).split("\n")[1];
  assert.equal(head, "GeoStrix | not a Mineral Resource estimate | v9.9.9 | EPSG:32609 | BM");
});
