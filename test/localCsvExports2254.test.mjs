// TASKS.csv #2254 / #2267 (review #2174, WA gold) — a CSV needs no CRS: rig and outcrop CSVs export in the project's own grid while the CRS
// is not set (lat / lon and true / magnetic left blank); KML / GPX / GeoPackage still ask for the CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rigRows } from "../src/lib/rigExport.js";
import { surfaceStructureRows } from "../src/lib/overlayExport.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#2254 / #2267 the rows build with no CRS: grid values kept, Earth values blank", () => {
  const [r] = rigRows([{ id: "p1", name: "P1", x: 32000, y: 808000, z: 200, azimuth: 90, dip: -60, length: 300 }], null, "2026-11-09", (h) => [{ x: h.x, y: h.y, z: h.z }, { x: h.x + 150, y: h.y, z: h.z - 260 }]);
  assert.equal(r.x, 32000); assert.equal(r.azimuth_grid, 90); assert.equal(r.lat, ""); assert.equal(r.azimuth_magnetic, ""); assert.equal(r.toe_x, 32150);
  const [s] = surfaceStructureRows({ name: "o", rows: [{ x: 32000, y: 808000, z: 400, dip: 60, dipDir: 120, type: "vein" }] }, null, null);
  assert.equal(s.dipdir_grid, 120); assert.equal(s.dipdir_true, "");
});

test("#2254 / #2267 wiring: only the CSV skips the CRS question on a no-CRS project", () => {
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /const local = project\?\.crsSet === false && format === "csv";/);
  assert.match(v, /crs: epsg \? `EPSG:\$\{epsg\}` : "not set \(project grid\)"/);
  assert.match(read("src/components/SurfaceMappingPanel.jsx"), /const local = project\?\.crsSet === false && fmt === "csv";/);
});
