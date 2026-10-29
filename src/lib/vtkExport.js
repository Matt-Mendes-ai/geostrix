// TASKS.csv #798 — VTK files for ParaView / PyVista users (pv.read() opens them), written here with no VTK dependency
// (the #792 PyVista review: take the interchange, not the 300 MB library). Legacy VTK format (vtk.org "VTK File
// Formats"): a 5-line ASCII header, then the data.
//  * surfaces: POLYDATA, ASCII, real-world coordinates (the OBJ / DXF exports' sceneVertsToWorld output);
//  * block models: on a regular lattice (estimationMeta.blockModelLattice) STRUCTURED_POINTS (image data) with the
//    value as CELL_DATA and NaN where the lattice has no block; otherwise (merged / octree models) UNSTRUCTURED_GRID of
//    VOXEL cells. BINARY (big-endian, as the format requires), so NaN is exact and the file stays compact.
import { blockModelLattice } from "./estimationMeta.js";
import { valueColumnName, numericCellFields, sectionTrueSize } from "./blockModelExport.js"; // TASKS.csv #1050; sectionTrueSize: #1093

const title = (s) => String(s).replace(/[\r\n]+/g, " ").slice(0, 250); // the format's title line: one line, <= 256 chars
// TASKS.csv #1053 (review #1016) — the title is all the provenance a legacy VTK file can carry, and it said only
// "<name> - GeoStrix - EPSG:x": it now leads with the not-a-resource statement and the note (the caller's version, CRS,
// edits), with the name last, so the 256-character limit cuts the name and never the statement
const stampTitle = (name, note) => title(`GeoStrix | not a Mineral Resource estimate${note ? ` | ${note}` : ""} | ${name}`);

// supported (#1103): per-triangle 1 / 0, written as CELL_DATA "supported" (0 = extrapolated beyond the inputs)
export function surfaceToVtk(name, vertices, indices, note = "", supported = null) {
  const lines = ["# vtk DataFile Version 3.0", stampTitle(name, note), "ASCII", "DATASET POLYDATA", `POINTS ${vertices.length} double`];
  for (const [x, y, z] of vertices) lines.push(`${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
  const nt = Math.floor(indices.length / 3);
  lines.push(`POLYGONS ${nt} ${nt * 4}`);
  for (let t = 0; t < nt; t++) lines.push(`3 ${indices[3 * t]} ${indices[3 * t + 1]} ${indices[3 * t + 2]}`);
  if (supported && supported.length === nt) { lines.push(`CELL_DATA ${nt}`, "SCALARS supported int 1", "LOOKUP_TABLE default"); for (let t = 0; t < nt; t++) lines.push(String(supported[t])); }
  return lines.join("\n") + "\n";
}

// Builds a binary legacy file from ASCII header chunks and big-endian numeric blocks
function assemble(parts) {
  const enc = new TextEncoder();
  const bufs = parts.map((p) => (typeof p === "string" ? enc.encode(p) : p));
  const out = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of bufs) { out.set(b, o); o += b.length; }
  return out;
}
const f32be = (vals) => { const dv = new DataView(new ArrayBuffer(vals.length * 4)); for (let i = 0; i < vals.length; i++) dv.setFloat32(i * 4, vals[i], false); return new Uint8Array(dv.buffer); };
const f64be = (vals) => { const dv = new DataView(new ArrayBuffer(vals.length * 8)); for (let i = 0; i < vals.length; i++) dv.setFloat64(i * 8, vals[i], false); return new Uint8Array(dv.buffer); };
const i32be = (vals) => { const dv = new DataView(new ArrayBuffer(vals.length * 4)); for (let i = 0; i < vals.length; i++) dv.setInt32(i * 4, vals[i], false); return new Uint8Array(dv.buffer); };
const scalarName = (s) => String(s || "value").replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 60) || "value";

// model: { name, cells: [{x, y, z, dx, dy, dz, value}], property? }. Returns { bytes, kind: "image" | "voxels" }.
export function blockModelToVtk(model, note = "") {
  const cells = model.cells || [];
  const field = scalarName(valueColumnName(model)); // #1050 — "Au_ppm", as the CSV and OMF name it (was "value")
  const extra = numericCellFields(cells); // #1050 — COVERAGE, KV, N_SAMPLES ... as further CELL_DATA arrays
  const scalars = (n, at) => extra.flatMap(({ name, get }) => { const a = new Float32Array(n).fill(NaN); at((c, i) => { const v = get(c); if (v != null) a[i] = v; }); return [`SCALARS ${scalarName(name)} float 1\nLOOKUP_TABLE default\n`, f32be(a), "\n"]; });
  const head = (dataset) => `# vtk DataFile Version 3.0\n${stampTitle(model.name, note)}\nBINARY\nDATASET ${dataset}\n`;
  // TASKS.csv #1093 — a DC/IP line's cells as the true rotated cells: one HEXAHEDRON (VTK type 12) each, ds along the line,
  // the section width across it, dz down (the axis-aligned boxes overlapped and held 1.87x the volume on an oblique line)
  if (model.section && cells.length && cells.every((c) => sectionTrueSize(model, c))) {
    const [ux, uy] = model.section.u, n0 = Math.hypot(ux, uy) || 1, u = [ux / n0, uy / n0], v = [-u[1], u[0]];
    const pts = new Float64Array(cells.length * 24), conn = new Int32Array(cells.length * 9), types = new Int32Array(cells.length).fill(12), vals = new Float32Array(cells.length);
    cells.forEach((c, n) => {
      const { ds, T, dz } = sectionTrueSize(model, c), a = ds / 2, b = T / 2;
      // VTK hexahedron order: the bottom face 0-3 counter-clockwise seen from above, then the top face 4-7 over it
      const corners = [[-a, -b], [a, -b], [a, b], [-a, b]];
      let p = 0;
      for (const sz of [-1, 1]) for (const [sa, sb] of corners) { pts.set([c.x + sa * u[0] + sb * v[0], c.y + sa * u[1] + sb * v[1], c.z + sz * dz / 2], n * 24 + p * 3); p++; }
      conn[n * 9] = 8; for (let k = 0; k < 8; k++) conn[n * 9 + 1 + k] = n * 8 + k;
      vals[n] = c.value;
    });
    const bytes = assemble([
      head("UNSTRUCTURED_GRID"), `POINTS ${cells.length * 8} double\n`, f64be(pts), "\n",
      `CELLS ${cells.length} ${cells.length * 9}\n`, i32be(conn), "\n", `CELL_TYPES ${cells.length}\n`, i32be(types), "\n",
      `CELL_DATA ${cells.length}\nSCALARS ${field} float 1\nLOOKUP_TABLE default\n`, f32be(vals), "\n",
      ...scalars(cells.length, (put) => cells.forEach((c, i) => put(c, i))),
    ]);
    return { bytes, kind: "section" };
  }
  const L = blockModelLattice(model);
  if (L && cells.length) {
    const ix = (c) => Math.round((c.x - L.ox) / L.dx - 0.5), iy = (c) => Math.round((c.y - L.oy) / L.dy - 0.5), iz = (c) => Math.round((c.z - L.oz) / L.dz - 0.5);
    let i0 = Infinity, j0 = Infinity, k0 = Infinity, i1 = -Infinity, j1 = -Infinity, k1 = -Infinity;
    for (const c of cells) { const i = ix(c), j = iy(c), k = iz(c); if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k; }
    const nx = i1 - i0 + 1, ny = j1 - j0 + 1, nz = k1 - k0 + 1;
    const vals = new Float32Array(nx * ny * nz).fill(NaN); // x fastest, then y, then z (VTK image order)
    for (const c of cells) vals[(iz(c) - k0) * nx * ny + (iy(c) - j0) * nx + (ix(c) - i0)] = c.value;
    const bytes = assemble([
      head("STRUCTURED_POINTS"),
      `DIMENSIONS ${nx + 1} ${ny + 1} ${nz + 1}\nORIGIN ${L.ox + i0 * L.dx} ${L.oy + j0 * L.dy} ${L.oz + k0 * L.dz}\nSPACING ${L.dx} ${L.dy} ${L.dz}\n`,
      `CELL_DATA ${vals.length}\nSCALARS ${field} float 1\nLOOKUP_TABLE default\n`, f32be(vals), "\n",
      ...scalars(vals.length, (put) => { for (const c of cells) put(c, (iz(c) - k0) * nx * ny + (iy(c) - j0) * nx + (ix(c) - i0)); }),
    ]);
    return { bytes, kind: "image", dims: [nx, ny, nz] };
  }
  // irregular: one VOXEL (VTK cell type 11) per block, its 8 corners in VTK's voxel order (x fastest, then y, then z)
  const pts = new Float64Array(cells.length * 24), conn = new Int32Array(cells.length * 9), types = new Int32Array(cells.length).fill(11), vals = new Float32Array(cells.length);
  cells.forEach((c, n) => {
    const hx = c.dx / 2, hy = c.dy / 2, hz = c.dz / 2;
    let p = 0;
    for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) { pts.set([c.x + sx * hx, c.y + sy * hy, c.z + sz * hz], n * 24 + p * 3); p++; }
    conn[n * 9] = 8; for (let k = 0; k < 8; k++) conn[n * 9 + 1 + k] = n * 8 + k;
    vals[n] = c.value;
  });
  const bytes = assemble([
    head("UNSTRUCTURED_GRID"), `POINTS ${cells.length * 8} double\n`, f64be(pts), "\n",
    `CELLS ${cells.length} ${cells.length * 9}\n`, i32be(conn), "\n", `CELL_TYPES ${cells.length}\n`, i32be(types), "\n",
    `CELL_DATA ${cells.length}\nSCALARS ${field} float 1\nLOOKUP_TABLE default\n`, f32be(vals), "\n",
    ...scalars(cells.length, (put) => cells.forEach((c, i) => put(c, i))),
  ]);
  return { bytes, kind: "voxels" };
}
