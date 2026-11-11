// TASKS.csv #2632 — GOCAD Voxet (.vo) import as a block model: the header, the big-endian side files, axis-aligned only, the UBC mesh path
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVoxetHeader, voxetGrid, readVoxetValues, voxetToUbc, findPropFile } from "../src/lib/gocadVoxet.js";
import { ubcMeshToCells } from "../src/lib/voxel.js";

const header = (extra = {}) => ["GOCAD Voxet 1", "HEADER {", "name:test", "}", ...(extra.depth ? ["GOCAD_ORIGINAL_COORDINATE_SYSTEM", "ZPOSITIVE Depth", "END_ORIGINAL_COORDINATE_SYSTEM"] : []),
  "AXIS_O 100 200 -50", `AXIS_U ${extra.u || "30 0 0"}`, "AXIS_V 0 10 0", `AXIS_W ${extra.w || "0 0 20"}`, "AXIS_MIN 0 0 0", "AXIS_MAX 1 1 1", "AXIS_N 3 2 2",
  "PROPERTY 1 Density", "PROP_FILE 1 test_Density@@", "PROP_ESIZE 1 4", "PROP_ETYPE 1 IEEE", "PROP_NO_DATA_VALUE 1 -99999", "PROP_UNIT 1 g/cc", "END"].join("\n");
const bytes = () => {
  const buf = new ArrayBuffer(12 * 4), dv = new DataView(buf);
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) dv.setFloat32((i + 3 * j + 6 * k) * 4, i + 10 * j + 100 * k, false);
  dv.setFloat32(0, -99999, false);
  return new Uint8Array(buf);
};
const at = (cells, x, y, z) => cells.find((c) => Math.abs(c.x - x) < 1e-6 && Math.abs(c.y - y) < 1e-6 && Math.abs(c.z - z) < 1e-6)?.value;

test("the header: name, axes, nodes, one property and its side file", () => {
  const h = parseVoxetHeader(header());
  assert.equal(h.name, "test"); assert.deepEqual(h.n, [3, 2, 2]);
  assert.deepEqual(h.props[0], { id: 1, name: "Density", file: "test_Density@@", esize: 4, etype: "IEEE", noData: -99999, unit: "g/cc", offset: 0, signed: true, format: "RAW" });
  assert.equal(findPropFile(h.props[0], [{ name: "other" }, { name: "test_Density@@" }]).name, "test_Density@@");
  assert.throws(() => parseVoxetHeader("GOCAD TSurf 1\nEND"), /not a GOCAD Voxet/);
});

test("blocks centred on the nodes, one node step wide; no-data left out; values in their place", () => {
  const h = parseVoxetHeader(header());
  const { mesh, values } = voxetToUbc(h, readVoxetValues(bytes(), h.props[0], 12));
  assert.deepEqual([mesh.x0, mesh.y0, mesh.z0, mesh.dx[0], mesh.dy[0], mesh.dz[0]], [92.5, 195, -20, 15, 10, 20]);
  const cells = ubcMeshToCells(mesh, Array.from(values));
  assert.equal(cells.length, 11);
  assert.equal(at(cells, 100, 200, -50), undefined); // the no-data node
  assert.equal(at(cells, 115, 200, -50), 1);
  assert.equal(at(cells, 130, 210, -30), 112);
  assert.equal(at(cells, 100, 210, -30), 110);
});

test("ZPOSITIVE Depth turns z over; an axis running backwards keeps each value at its node", () => {
  const d = parseVoxetHeader(header({ depth: true }));
  const cd = ubcMeshToCells(...(({ mesh, values }) => [mesh, Array.from(values)])(voxetToUbc(d, readVoxetValues(bytes(), d.props[0], 12))));
  assert.equal(at(cd, 130, 210, 30), 112); // z -30 read as a depth -> elevation +30
  assert.equal(at(cd, 115, 200, 50), 1);
  const b = parseVoxetHeader(header({ u: "-30 0 0" })); // nodes at x 100, 85, 70
  const cb = ubcMeshToCells(...(({ mesh, values }) => [mesh, Array.from(values)])(voxetToUbc(b, readVoxetValues(bytes(), b.props[0], 12))));
  assert.equal(at(cb, 85, 200, -50), 1); assert.equal(at(cb, 70, 210, -30), 112);
});

test("a rotated voxet is refused with the reason; a short side file too", () => {
  assert.throws(() => voxetGrid(parseVoxetHeader(header({ u: "21.2 21.2 0" }))), /rotated \(AXIS_U is not along x\)/);
  const h = parseVoxetHeader(header());
  assert.throws(() => readVoxetValues(new Uint8Array(10), h.props[0], 12), /holds 10 bytes, 48 expected/);
});

test("the drop wires it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /const voFiles = grouped\.files\.filter\(\(f\) => \/\\\.vo\$\/i\.test\(f\.name\)\), voSide = new Set\(\);/);
  assert.match(u, /addVoxelModel\(\{ name, source: "gocad", cells, min, max/);
});
