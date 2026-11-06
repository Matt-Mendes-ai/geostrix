// TASKS.csv #1348 — a UBC-GIF DCIP2D inversion (dcinv2d.msh + .con / .chg + topography) read into the app's section form
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDcip2dMeshText, looksLikeDcip2dModel, parseDcip2dMesh, parseDcip2dModel, parseDcip2dTopo, dcip2dSection, meshCore } from "../src/lib/ubc2d.js";

const MESH = "  3\n  -100.00  0.00  1\n  200.00  2\n  400.00  1\n\n  2\n  0.00  20.00  2\n  60.00  1\n";
const CON = "  4  3\n 1.0E-10 1.0E-10 0.01 0.02\n 0.001 0.002\n 0.004 0.005\n 0.0005 0.0005 0.0005 0.0005\n";
const CHG = "  4  3\n -1.0E+30 -1.0E+30 12 13\n 3 4 5 6\n 7 8 9 10\n";
const TOPO = " 3  1000\n   0.00 980.00\n 100.00 990.00\n 200.00 985.00\n";

test("the mesh: segments to nodes, x along the line and z down from the top", () => {
  assert.ok(isDcip2dMeshText(MESH)); assert.ok(!isDcip2dMeshText("3 3 3\n-100 -100 0\n")); // a 3D mesh starts with NX NY NZ
  const m = parseDcip2dMesh(MESH);
  assert.deepEqual(m.x, [-100, 0, 100, 200, 400]); assert.deepEqual(m.z, [0, 10, 20, 60]); assert.deepEqual([m.nx, m.nz], [4, 3]);
  assert.deepEqual(meshCore(m), [-100, 200]); // the 400 m padding cell is more than 1.5x the 100 m core cells
  assert.ok(looksLikeDcip2dModel(CON)); assert.ok(!looksLikeDcip2dModel(MESH));
  assert.ok(!looksLikeDcip2dModel(TOPO), "a topography file (n points, mesh top) is not a model"); // live: Line10N_Topo.txt '55 1100' was read as a model
});

test("the models: row by row from the top, counts checked; the topography's first line is the mesh top elevation", () => {
  const m = parseDcip2dMesh(MESH);
  const con = parseDcip2dModel(CON, m);
  assert.equal(con.length, 12); assert.equal(con[2], 0.01); assert.equal(con[4], 0.001); assert.equal(con[11], 0.0005);
  assert.throws(() => parseDcip2dModel("  5  3\n1 2 3 4 5\n", m), /5 x 3 cells but the mesh is 4 x 3/);
  assert.throws(() => parseDcip2dModel("  4  3\n1 2 3\n", m), /holds 3 values; 12 expected/);
  assert.deepEqual(parseDcip2dTopo(TOPO), { topElevation: 1000, points: [[0, 980], [100, 990], [200, 985]] });
  assert.equal(parseDcip2dTopo(CON), null); // 4 x 3 header but 12 values, not 4 pairs
});

test("the section: air cells dropped, resistivity = 1 / conductivity, elevations from the mesh top, chargeability nulls", () => {
  const m = parseDcip2dMesh(MESH);
  const r = dcip2dSection({ mesh: m, con: parseDcip2dModel(CON, m), chg: parseDcip2dModel(CHG, m), topElevation: 1000 });
  assert.equal(r.kind, "dcip2d"); assert.deepEqual(r.counts, { cells: 4, air: 2, padding: 6 }); // the 200 m padding column and the 40 m deep row left out
  assert.deepEqual(r.cells.s.slice(0, 3), [150, -50, 50]); // row 0: the two air cells left out, then row 1 from the left
  assert.deepEqual(r.cells.z.slice(0, 3), [995, 985, 985]); // 1000 - 5, then 1000 - 15
  assert.deepEqual(r.cells.ds.slice(0, 3), [100, 100, 100]); assert.deepEqual(r.cells.dz.slice(0, 3), [10, 10, 10]);
  assert.deepEqual(r.cells.resistivity.slice(0, 3), [100, 1000, 500]);
  assert.deepEqual(r.cells.chargeability.slice(0, 2), [12, 3]);
  const full = dcip2dSection({ mesh: m, con: parseDcip2dModel(CON, m), topElevation: 1000, core: false });
  assert.deepEqual(full.counts, { cells: 10, air: 2, padding: 0 }); assert.equal(full.cells.s[1], 300);
  assert.ok(r.cells.support.every((v) => v === 1));
  assert.deepEqual(r.mesh, { shape: [4, 3], topElevation: 1000, imported: "UBC-GIF DCIP2D", xRange: [-100, 400], depth: 60 });
  const ipOnly = dcip2dSection({ mesh: m, chg: parseDcip2dModel(CHG, m), topElevation: 0 });
  assert.equal(ipOnly.counts.air, 2); assert.equal(ipOnly.cells.resistivity[0], null); assert.equal(ipOnly.counts.cells, 4);
  assert.throws(() => dcip2dSection({ mesh: m }), /conductivity .* or chargeability/);
});

test("the panel imports it and the 3D mesh reader points a 2D mesh here", () => {
  const p = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /Import a UBC DCIP2D inversion \(mesh \+ model\)…/);
  assert.match(p, /dcip2dSection\(\{ mesh, con, chg, topElevation/);
  assert.match(p, /section: \{ result: slimDcipResult\(result\), line: placement, opts: \{ cell: String\(thick\), imported: "UBC-GIF DCIP2D" \}/);
  assert.match(p, /const imported = result\.imported \|\| result\.mesh\?\.imported \|\| null;/); // no "misfit NaN" verdict, no data-fit pane for an import
  assert.match(p, /\{last\.obs && !imported && <DataFit/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /isDcip2dMeshText\(meshText\)/);
  assert.match(g, /This is a UBC DCIP2D \(2D\) mesh/);
  const st = readFileSync(new URL("../src/lib/dcipStations.js", import.meta.url), "utf8");
  assert.match(st, /utmeasting/); assert.match(st, /xgrid/); // the contractor's survey file: X_Grid, UTM_Easting, UTM_Northing
});
