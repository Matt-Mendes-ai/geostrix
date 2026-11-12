// TASKS.csv #2726 (split from #2692) — a GOCAD SGrid (.sg) as a block model: header, binary points / property side files, nodes or cell
// centres resampled onto an east / north / up lattice (nearest sample within one cell). SYNTHETIC grids only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSgridHeader, readSgridPoints, sgridSamples, sgridLattice, resampleSgrid, readSgridValues } from "../src/lib/gocadSgrid.js";
import { voxetToUbc } from "../src/lib/gocadVoxet.js";
import { ubcMeshToCells } from "../src/lib/voxel.js";

const NU = 6, NV = 5, NW = 4;
// a curvilinear grid: 10 m steps, the u lines sheared 3 m north per u step, the layers folded (z up and down along u), z as depth
const node = (i, j, k) => [500000 + 10 * i, 6000000 + 10 * j + 3 * i, -(1000 - 10 * k + 4 * Math.sin(i))];
function be32f(values) { const b = new DataView(new ArrayBuffer(values.length * 4)); values.forEach((v, i) => b.setFloat32(i * 4, v, false)); return new Uint8Array(b.buffer); }
const pointsBytes = () => { const v = []; for (let k = 0; k < NW; k++) for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) v.push(...node(i, j, k)); return be32f(v); };
const headerText = (align = "POINTS") => `GOCAD SGrid 1
HEADER {
name:SYNTH_folded
}
GOCAD_ORIGINAL_COORDINATE_SYSTEM
NAME Default
ZPOSITIVE Depth
END_ORIGINAL_COORDINATE_SYSTEM
AXIS_N ${NU} ${NV} ${NW}
PROP_ALIGNMENT ${align}
POINTS_OFFSET 0
POINTS_FILE SYNTH_folded__points@@
FLAGS_FILE SYNTH_folded__flags@@
PROPERTY 1 Density
PROP_UNIT 1 g/cc
PROP_ESIZE 1 4
PROP_ETYPE 1 IEEE
PROP_NO_DATA_VALUE 1 -99999
PROP_FILE 1 SYNTH_folded__Density@@
END
`;

test("the header: dimensions, depth-positive z, alignment, side files and properties; what it refuses", () => {
  const h = parseSgridHeader(headerText("CELLS"));
  assert.deepEqual([h.name, h.n, h.zSign, h.align, h.pointsFile], ["SYNTH_folded", [6, 5, 4], -1, "CELLS", "SYNTH_folded__points@@"]);
  assert.deepEqual([h.props[0].name, h.props[0].file, h.props[0].unit, h.props[0].noData], ["Density", "SYNTH_folded__Density@@", "g/cc", -99999]);
  assert.throws(() => parseSgridHeader("GOCAD Voxet 1\nAXIS_N 2 2 2\n"), /not a GOCAD SGrid/);
  assert.throws(() => parseSgridHeader("GOCAD SGrid 1\nAXIS_N 2 2 2\nASCII_DATA_FILE grid.dat\n"), /ASCII data file \(grid\.dat\).*binary files/);
  assert.throws(() => parseSgridHeader("GOCAD SGrid 1\nPOINTS_FILE p@@\n"), /lacks AXIS_N/);
});

test("the points file: big-endian floats, z turned up from depth; a short file is refused with its sizes", () => {
  const h = parseSgridHeader(headerText()), p = readSgridPoints(pointsBytes(), h);
  assert.equal(p.length, NU * NV * NW * 3);
  const at = (i, j, k) => { const s = 3 * (i + j * NU + k * NU * NV); return [p[s], p[s + 1], p[s + 2]]; };
  const want = node(2, 3, 1);
  assert.deepEqual(at(2, 3, 1).map((v) => Math.round(v * 100) / 100), [want[0], want[1], Math.round(-want[2] * 100) / 100]); // depth -> elevation
  assert.throws(() => readSgridPoints(pointsBytes().slice(0, 100), h), /holds 100 bytes, 1,440 expected/);
});

test("node values resampled onto an east / north / up lattice: every block takes its nearest node's value, none farther than one cell", () => {
  const h = parseSgridHeader(headerText()), pts = readSgridPoints(pointsBytes(), h), smp = sgridSamples(h, pts);
  const vals = []; for (let k = 0; k < NW; k++) for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) vals.push(i + 10 * j + 100 * k);
  const v = readSgridValues(be32f(vals), h.props[0], smp.count);
  const L = sgridLattice(smp);
  assert.ok(L.reach > 10 && L.reach < 11, String(L.reach)); // the sheared u step: hypot(10, 3)
  assert.ok(L.step[2] > 8 && L.step[2] <= 10, String(L.step[2])); // the w spacing (10 m), the folded height split into whole blocks
  const out = resampleSgrid(L, v);
  let filled = 0;
  const [nx, ny] = L.header.n;
  for (let o = 0; o < out.length; o++) {
    if (!Number.isFinite(out[o])) continue;
    filled++;
    const i = o % nx, j = Math.floor(o / nx) % ny, k = Math.floor(o / (nx * ny));
    const x = L.header.origin[0] + i * L.step[0], y = L.header.origin[1] + j * L.step[1], z = L.header.origin[2] + k * L.step[2];
    let best = Infinity, bv = null;
    for (let s = 0; s < smp.count; s++) { const dd = (pts[3 * s] - x) ** 2 + (pts[3 * s + 1] - y) ** 2 + (pts[3 * s + 2] - z) ** 2; if (dd < best) { best = dd; bv = v[s]; } }
    assert.ok(Math.sqrt(best) <= L.reach + 1e-9);
    assert.equal(out[o], bv); // the nearest node, by brute force
  }
  assert.ok(filled > NU * NV * NW * 0.8, `${filled} blocks filled`);
  // and into a UBC mesh + cells, as the Voxet import does
  const { mesh, values } = voxetToUbc(L.header, out);
  const cells = ubcMeshToCells(mesh, Array.from(values));
  assert.equal(cells.length, filled);
});

test("cell-aligned properties sit on the cell centres; no-data stays empty", () => {
  const h = parseSgridHeader(headerText("CELLS")), smp = sgridSamples(h, readSgridPoints(pointsBytes(), h));
  assert.equal(smp.count, (NU - 1) * (NV - 1) * (NW - 1));
  const c0 = [0, 1, 2].map((q) => smp.xyz[q]), n0 = node(0, 0, 0), n1 = node(1, 1, 1);
  assert.ok(Math.abs(c0[0] - (n0[0] + n1[0]) / 2) < 1e-6 && Math.abs(c0[2] - 995) < 3); // between the corners, z up
  const vals = new Array(smp.count).fill(2.7); vals[0] = -99999;
  const v = readSgridValues(be32f(vals), h.props[0], smp.count);
  assert.ok(Number.isNaN(v[0]) && v[1] === Math.fround(2.7));
});

test("Geophysics > Block models reads an SGrid with its side files", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const importSgrid = async \(fileList\) => \{/);
  assert.match(src, /tr\("Import GOCAD SGrid \(\.sg \+ its side files\)…"\)/);
  assert.match(src, /ref=\{sgridInput\}\s+type="file"\s+multiple/); // no accept list: the side files have no extension (name__points@@)
});
