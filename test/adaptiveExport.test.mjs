// TASKS.csv #324 — an adaptive (octree) model has no single grid: the export package still works, as a cell
// list + data + provenance, instead of refusing everything (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { buildModelExportZip } from "../src/lib/modelExport.js";
import { readZipEntries } from "../src/lib/shapefile.js";

test("#324 adaptive model export: cells CSV + provenance, no UBC/OMF/slices; a regular model is unchanged", async () => {
  // four 25 m cells over one 50 m cell below them: an octree-like pair of levels
  const fine = [[12.5, 12.5], [37.5, 12.5], [12.5, 37.5], [37.5, 37.5]].map(([x, y], i) => ({ x: 460000 + x, y: 6250000 + y, z: 987.5, dx: 25, dy: 25, dz: 25, value: 0.001 * (i + 1), support: 0.9 }));
  const cells = [...fine, { x: 460025, y: 6250025, z: 950, dx: 50, dy: 50, dz: 50, value: 0.02, support: 0.4 }];
  const r = await buildModelExportZip({ name: "Octree test", cells, source: "simpeg", params: { mesh: { type: "octree" } } }, 3156);
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.files.map((f) => f.replace(/^Octree_test/, "")), ["_cells.csv", "provenance.txt"]);
  const e = await readZipEntries(r.zip, /./);
  const csv = new TextDecoder().decode(e["Octree_test_cells.csv"]).trim().split("\n");
  assert.equal(csv[0], "x,y,z,dx,dy,dz,value,support");
  assert.deepEqual(csv.slice(1).map((l) => l.split(",").map(Number)), cells.map((c) => [c.x, c.y, c.z, c.dx, c.dy, c.dz, c.value, c.support]));
  const prov = new TextDecoder().decode(e["provenance.txt"]);
  assert.match(prov, /Mesh: adaptive \(octree\), 5 cells of 25 \/ 50 m, x 460000\.00-460050\.00/);
  assert.match(prov, /no UBC \.msh\/\.mod, OMF or depth-slice files/);
  // a regular model still gets the full package
  const reg = await buildModelExportZip({ name: "Regular", cells: fine, source: "simpeg" }, 3156);
  assert.ok(reg.files.includes("Regular.msh") && reg.files.includes("Regular.mod") && reg.files.includes("Regular.omf"));
});
