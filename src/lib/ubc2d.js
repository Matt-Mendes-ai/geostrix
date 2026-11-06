// TASKS.csv #1348 (from the #1345 sweep: ARIS 42641Z, 11 lines) — a contractor's UBC-GIF DCIP2D inversion as GeoStrix reads it:
// the 2D mesh (dcinv2d.msh), the conductivity (dcinv2d.con) and chargeability (ipinv2d.chg) models and the topography file,
// turned into the same section the app's own 2D inversion produces (cells along the line with s, z, ds, dz, resistivity,
// chargeability), so it is placed, drawn, exported and sent to 3D like one of ours. Pure.
//
// Mesh: line 1 = the number of x segments; then "x0 x1 n" and "x n" lines (node positions, n cells to that node); a blank
// line; the number of z segments; "z0 z1 n" and "z n" (z positive DOWN from the top of the mesh). Model: "NX NZ" then
// NX x NZ values row by row, each row one z (the top first). Air cells hold a conductivity of ~1e-10 (chargeability -1e30).
// Topography: "n  elevationOfMeshTop" then "distance elevation" pairs.
const nums = (line) => line.trim().split(/\s+/).map(Number);

export function isDcip2dMeshText(text) {
  const l = String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return /^\d+$/.test(l[0] || "") && /^-?\d/.test(l[1] || "") && nums(l[1] || "").length === 3 && nums(l[1]).every(Number.isFinite);
}
export function looksLikeDcip2dModel(text) {
  const l = String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const h = nums(l[0] || "");
  // a topography file also starts with two integers ("55 1100": 55 points, mesh top 1,100 m) - it is not a model
  return h.length === 2 && h.every((v) => Number.isInteger(v) && v > 0) && l.length > 1 && nums(l[1]).every(Number.isFinite) && !parseDcip2dTopo(text);
}

function readSegments(lines, i0) {
  const nSeg = Number(lines[i0]);
  if (!Number.isInteger(nSeg) || nSeg < 1) throw new Error(`Bad segment count "${lines[i0]}".`);
  const nodes = [];
  for (let k = 0; k < nSeg; k++) {
    const v = nums(lines[i0 + 1 + k] || "");
    if (k === 0) { if (v.length !== 3) throw new Error(`Bad first segment "${lines[i0 + 1]}": expected "start end n".`); nodes.push(v[0]); pushCells(nodes, v[1], v[2]); }
    else { if (v.length !== 2) throw new Error(`Bad segment "${lines[i0 + 1 + k]}": expected "end n".`); pushCells(nodes, v[0], v[1]); }
  }
  return { nodes, next: i0 + 1 + nSeg };
}
function pushCells(nodes, end, n) {
  const start = nodes[nodes.length - 1];
  if (!(Number.isInteger(n) && n > 0) || !(end > start)) throw new Error(`Bad segment to ${end} with ${n} cells.`);
  for (let i = 1; i <= n; i++) nodes.push(start + ((end - start) * i) / n);
}

// -> { x: node positions along the line, z: node depths from the mesh top, nx, nz }
export function parseDcip2dMesh(text) {
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const xs = readSegments(lines, 0);
  const zs = readSegments(lines, xs.next);
  return { x: xs.nodes, z: zs.nodes, nx: xs.nodes.length - 1, nz: zs.nodes.length - 1 };
}

// -> Float64Array(nx * nz), index = j * nx + i (j = z row from the top, i = x column)
export function parseDcip2dModel(text, mesh) {
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const [nx, nz] = nums(lines[0]);
  if (nx !== mesh.nx || nz !== mesh.nz) throw new Error(`The model is ${nx} x ${nz} cells but the mesh is ${mesh.nx} x ${mesh.nz}.`);
  const out = new Float64Array(nx * nz);
  let k = 0;
  for (let i = 1; i < lines.length && k < out.length; i++) for (const v of nums(lines[i])) { if (k < out.length) out[k++] = v; }
  if (k !== out.length) throw new Error(`The model holds ${k} values; ${out.length} expected.`);
  return out;
}

// -> { topElevation, points: [[s, z]] } ; null when the text is not a topography file
export function parseDcip2dTopo(text) {
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const h = nums(lines[0] || "");
  if (h.length !== 2 || !Number.isInteger(h[0]) || h[0] < 2) return null;
  const points = [];
  for (let i = 1; i < lines.length; i++) { const v = nums(lines[i]); if (v.length === 2 && v.every(Number.isFinite)) points.push(v); }
  if (points.length < 2 || points.length !== h[0]) return null;
  return { topElevation: h[1], points };
}

export const AIR_CONDUCTIVITY = 1e-8; // S/m: UBC / SimPEG air cells (1e-10 in the files seen)
// -> the section result: { kind: "dcip2d", cells: { s, z, ds, dz, resistivity, chargeability?, support }, electrodes: [], mesh, counts }
// z is the cell centre's elevation: topElevation - depth. Air cells (both models) are left out; a chargeability of
// -1e30 (no value) becomes null.
// core = true leaves out the padding: cells outside the smallest-cell span along the line and the geometrically growing deep
// cells (dz over 3x the smallest), which run kilometres out and down in a contractor's mesh (Line 6N: 8.3 km deep) and would
// swamp the 3D view with cells the data never saw.
export function dcip2dSection({ mesh, con = null, chg = null, topElevation = 0, core = true }) {
  if (!con && !chg) throw new Error("A conductivity (.con) or chargeability (.chg) model is needed.");
  const s = [], z = [], ds = [], dz = [], resistivity = [], chargeability = [], support = [];
  let air = 0, padding = 0;
  const [cx0, cx1] = core ? meshCore(mesh) : [-Infinity, Infinity];
  let minDz = Infinity;
  for (let j = 0; j < mesh.nz; j++) minDz = Math.min(minDz, mesh.z[j + 1] - mesh.z[j]);
  for (let j = 0; j < mesh.nz; j++) {
    const deep = core && mesh.z[j + 1] - mesh.z[j] > 3 * minDz;
    for (let i = 0; i < mesh.nx; i++) {
      const k = j * mesh.nx + i;
      if (deep || mesh.x[i] < cx0 - 1e-9 || mesh.x[i + 1] > cx1 + 1e-9) { padding++; continue; }
      const sigma = con ? con[k] : null, q = chg ? chg[k] : null;
      const isAir = con ? !(sigma > AIR_CONDUCTIVITY) : !(q > -1e29);
      if (isAir) { air++; continue; }
      s.push((mesh.x[i] + mesh.x[i + 1]) / 2);
      z.push(topElevation - (mesh.z[j] + mesh.z[j + 1]) / 2);
      ds.push(mesh.x[i + 1] - mesh.x[i]);
      dz.push(mesh.z[j + 1] - mesh.z[j]);
      resistivity.push(con ? 1 / sigma : null);
      chargeability.push(chg ? (q > -1e29 ? q : null) : null);
      support.push(1);
    }
  }
  const cells = { s, z, ds, dz, resistivity: con ? resistivity : resistivity.map(() => null), support, ...(chg ? { chargeability } : {}) };
  return { kind: "dcip2d", imported: "UBC-GIF DCIP2D", cells, electrodes: [], mesh: { shape: [mesh.nx, mesh.nz], topElevation, imported: "UBC-GIF DCIP2D", xRange: [mesh.x[0], mesh.x[mesh.nx]], depth: mesh.z[mesh.nz] }, counts: { cells: s.length, air, padding } };
}

// the core of the mesh: the extent of the smallest cells (the padding cells grow outwards), for the placement's two points
export function meshCore(mesh) {
  let min = Infinity;
  for (let i = 0; i < mesh.nx; i++) min = Math.min(min, mesh.x[i + 1] - mesh.x[i]);
  let a = 0, b = mesh.nx;
  while (a < mesh.nx && mesh.x[a + 1] - mesh.x[a] > min * 1.5) a++;
  while (b > 0 && mesh.x[b] - mesh.x[b - 1] > min * 1.5) b--;
  return b > a ? [mesh.x[a], mesh.x[b]] : [mesh.x[0], mesh.x[mesh.nx]];
}
