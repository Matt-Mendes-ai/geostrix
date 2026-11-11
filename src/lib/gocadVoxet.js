// TASKS.csv #2632 — a GOCAD Voxet (.vo) as a block model: the Voxet half of what the GOCAD import (#1992) left for later. Written from the
// format as it is publicly documented (clean room). A .vo file is an ASCII header; its property values live in binary side files the
// header names (PROP_FILE), big-endian by default:
//   GOCAD Voxet 1 / HEADER { name:… } / GOCAD_ORIGINAL_COORDINATE_SYSTEM … ZPOSITIVE Depth … END_ORIGINAL_COORDINATE_SYSTEM
//   AXIS_O x y z          the origin
//   AXIS_U ux uy uz       the three axis vectors (their length is the full extent along the axis when AXIS_MIN / MAX are 0 / 1)
//   AXIS_V … / AXIS_W …
//   AXIS_MIN a b c / AXIS_MAX a b c   (default 0 0 0 / 1 1 1)
//   AXIS_N nu nv nw       nodes along each axis
//   PROPERTY 1 Density / PROP_FILE 1 model_Density@@ / PROP_ESIZE 1 4 / PROP_ETYPE 1 IEEE / PROP_NO_DATA_VALUE 1 -99999 / PROP_UNIT 1 g/cc
//   PROP_FORMAT 1 RAW / PROP_OFFSET 1 0 / PROP_SIGNED 1 1
// Node (i, j, k) sits at O + (MIN_u + i (MAX_u - MIN_u) / (N_u - 1)) U + … (V, W likewise); values run u fastest, then v, then w. Each node
// becomes a block centred on it, one node step wide. voxetGrid reads an AXIS-ALIGNED voxet (U along x, V along y, W along z, any sign) and
// refuses a rotated one; since TASKS.csv #2692 the import first resamples a rotated voxet onto an aligned lattice (alignedLattice /
// resampleVoxet below, nearest node, said in the notice), never drawing it as if it were aligned. Pure: no DOM, no three.js.

const nums = (s) => String(s).trim().split(/\s+/).map(Number);

// header text -> { name, origin, axes: { u, v, w }, min, max, n, zSign, props: [{ id, name, file, esize, etype, noData, unit, offset, signed, format }] }
export function parseVoxetHeader(text) {
  const h = { name: "", origin: [0, 0, 0], axes: { u: null, v: null, w: null }, min: [0, 0, 0], max: [1, 1, 1], n: null, zSign: 1, props: [] };
  const prop = (id) => { let p = h.props.find((q) => q.id === id); if (!p) h.props.push((p = { id, name: `property ${id}`, file: "", esize: 4, etype: "IEEE", noData: null, unit: "", offset: 0, signed: true, format: "RAW" })); return p; };
  let inHeader = false, sawVoxet = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    if (/^GOCAD\s+Voxet/i.test(line)) { sawVoxet = true; continue; }
    if (/^HEADER\s*\{/i.test(line)) { inHeader = !/\}\s*$/.test(line); const m = /name\s*:\s*([^}]+)/i.exec(line); if (m) h.name = m[1].trim(); continue; }
    if (inHeader) { if (line.startsWith("}")) inHeader = false; else { const m = /^\*?name\s*:\s*(.+)$/i.exec(line); if (m && !h.name) h.name = m[1].trim(); } continue; }
    const sp = line.indexOf(" "), kw = (sp < 0 ? line : line.slice(0, sp)).toUpperCase(), rest = sp < 0 ? "" : line.slice(sp + 1).trim();
    if (kw === "ZPOSITIVE") { h.zSign = /depth/i.test(rest) ? -1 : 1; continue; }
    if (kw === "AXIS_O") { h.origin = nums(rest); continue; }
    if (kw === "AXIS_U") { h.axes.u = nums(rest); continue; }
    if (kw === "AXIS_V") { h.axes.v = nums(rest); continue; }
    if (kw === "AXIS_W") { h.axes.w = nums(rest); continue; }
    if (kw === "AXIS_MIN") { h.min = nums(rest); continue; }
    if (kw === "AXIS_MAX") { h.max = nums(rest); continue; }
    if (kw === "AXIS_N") { h.n = nums(rest).map((v) => Math.round(v)); continue; }
    const m = /^(\d+)\s+(.*)$/.exec(rest);
    if (!m) continue;
    const id = Number(m[1]), val = m[2].trim();
    if (kw === "PROPERTY") prop(id).name = val;
    else if (kw === "PROP_FILE") prop(id).file = val;
    else if (kw === "PROP_ESIZE") prop(id).esize = Number(val);
    else if (kw === "PROP_ETYPE") prop(id).etype = val.toUpperCase();
    else if (kw === "PROP_NO_DATA_VALUE") prop(id).noData = Number(val);
    else if (kw === "PROP_UNIT") prop(id).unit = val;
    else if (kw === "PROP_OFFSET") prop(id).offset = Number(val) || 0;
    else if (kw === "PROP_SIGNED") prop(id).signed = val !== "0";
    else if (kw === "PROP_FORMAT") prop(id).format = val.toUpperCase();
  }
  if (!sawVoxet) throw new Error("not a GOCAD Voxet (no 'GOCAD Voxet' line)");
  if (!h.n || h.n.length < 3 || !h.axes.u || !h.axes.v || !h.axes.w) throw new Error("the Voxet header lacks AXIS_N or an axis vector");
  return h;
}

// -> { nx, ny, nz, step: [dx, dy, dz], first: [x, y, z] node centre of (0,0,0) in world axes, flip: [fx, fy, fz] (-1 where the axis runs
// against x / y / z) } or throws when an axis is not along x / y / z
export function voxetGrid(h) {
  const [nu, nv, nw] = h.n, axes = [h.axes.u, h.axes.v, h.axes.w], names = ["U", "V", "W"];
  const step = [], flip = [];
  for (let a = 0; a < 3; a++) {
    const vec = axes[a], len = Math.hypot(...vec), along = vec[a];
    if (!(len > 0)) throw new Error(`AXIS_${names[a]} has no length`);
    if (Math.abs(Math.abs(along) - len) > 1e-6 * len) throw new Error(`this Voxet is rotated (AXIS_${names[a]} is not along ${"xyz"[a]}): GeoStrix reads axis-aligned voxets only, and will not draw a rotated one as if it were aligned`);
    const n = h.n[a], span = (h.max[a] - h.min[a]) * len;
    step.push(n > 1 ? Math.abs(span) / (n - 1) : len);
    flip.push(Math.sign(along) * Math.sign(h.max[a] - h.min[a] || 1));
  }
  const first = [0, 1, 2].map((a) => h.origin[a] + h.min[a] * axes[a][a]);
  if (h.zSign < 0) { first[2] = -first[2]; flip[2] = -flip[2]; }
  return { nx: nu, ny: nv, nz: nw, step, first, flip };
}

// bytes of one property's side file -> Float64Array of n values (no-data as NaN). IEEE 4 / 8 bytes, or integers of 1 / 2 / 4 bytes, big-endian.
export function readVoxetValues(bytes, prop, n) {
  if (prop.format && prop.format !== "RAW") throw new Error(`${prop.name}: PROP_FORMAT ${prop.format} is not read (RAW only)`);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const es = prop.esize || 4, off = prop.offset || 0, ieee = /IEEE|FLOAT|DOUBLE/.test(prop.etype || "IEEE");
  if (u8.byteLength < off + n * es) throw new Error(`${prop.name}: its file holds ${u8.byteLength.toLocaleString()} bytes, ${(off + n * es).toLocaleString()} expected (${n.toLocaleString()} values of ${es} bytes)`);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = off + i * es;
    let v;
    if (ieee) v = es === 8 ? dv.getFloat64(p, false) : dv.getFloat32(p, false);
    else if (es === 1) v = prop.signed ? dv.getInt8(p) : dv.getUint8(p);
    else if (es === 2) v = prop.signed ? dv.getInt16(p, false) : dv.getUint16(p, false);
    else v = prop.signed ? dv.getInt32(p, false) : dv.getUint32(p, false);
    out[i] = Number.isFinite(v) && !(prop.noData != null && Math.abs(v - prop.noData) <= Math.abs(prop.noData) * 1e-6 + 1e-9) ? v : NaN;
  }
  return out;
}

// the voxet as the UBC mesh shape lib/voxel.js coarsens and turns into cells: { nx, ny, nz, x0, y0, z0 (TOP), dx[], dy[], dz[] } and the
// values reordered from voxet order (u fastest, then v, then w) to UBC order (x fastest, then z from the top down, then y)
export function voxetToUbc(h, values) {
  const g = voxetGrid(h), [dxs, dys, dzs] = g.step, { nx, ny, nz } = g;
  // the world position of node 0 along each axis, and whether node index grows with x / y / z
  const lo = (a, n) => (g.flip[a] > 0 ? g.first[a] : g.first[a] - (n - 1) * g.step[a]); // the smallest node coordinate
  const x0 = lo(0, nx) - dxs / 2, y0 = lo(1, ny) - dys / 2, zTop = lo(2, nz) + (nz - 1) * dzs + dzs / 2;
  const out = new Float64Array(nx * ny * nz);
  let o = 0;
  for (let iy = 0; iy < ny; iy++) {
    const j = g.flip[1] > 0 ? iy : ny - 1 - iy;
    for (let iz = 0; iz < nz; iz++) { // UBC z runs from the top down
      const k = g.flip[2] > 0 ? nz - 1 - iz : iz;
      for (let ix = 0; ix < nx; ix++) {
        const i = g.flip[0] > 0 ? ix : nx - 1 - ix;
        out[o++] = values[i + j * nx + k * nx * ny];
      }
    }
  }
  const mesh = { nx, ny, nz, x0, y0, z0: zTop, dx: new Array(nx).fill(dxs), dy: new Array(ny).fill(dys), dz: new Array(nz).fill(dzs) };
  return { mesh, values: out };
}

// the side file a property names, among the dropped files: by name, or by the name without a folder part
export function findPropFile(prop, files) {
  const want = String(prop.file || "").replace(/^.*[\\/]/, "").toLowerCase();
  return want ? (files || []).find((f) => String(f.name).toLowerCase() === want) || null : null;
}

// TASKS.csv #2692 — a rotated voxet (axes not along east, north and up). isVoxetAligned: every axis along its own world axis (any sign).
export function isVoxetAligned(h) {
  return [h.axes.u, h.axes.v, h.axes.w].every((vec, a) => { const len = Math.hypot(...vec); return len > 0 && Math.abs(Math.abs(vec[a]) - len) <= 1e-6 * len; });
}

// the node step vectors (world, z up) and the world position of node (0,0,0)
function nodeFrame(h) {
  const axes = [h.axes.u, h.axes.v, h.axes.w];
  const S = axes.map((vec, a) => { const f = h.n[a] > 1 ? (h.max[a] - h.min[a]) / (h.n[a] - 1) : 1; return [vec[0] * f, vec[1] * f, vec[2] * f * h.zSign]; });
  const P0 = [0, 1, 2].map((c) => h.origin[c] + h.min[0] * axes[0][c] + h.min[1] * axes[1][c] + h.min[2] * axes[2][c]);
  P0[2] *= h.zSign;
  return { S, P0 };
}

// a rotated voxet -> an axis-aligned lattice over its bounding box: { header (aligned, z up, no properties), map: Int32Array (each aligned
// node -> the nearest voxet node, -1 outside the voxet), rotationDeg (U's bearing from east, in plan), step: [dx, dy, dz] }. Each world
// axis takes the finest node step among the voxet axes that run mostly along it, halved where a voxet axis crosses it at an angle: at the
// voxet's own step a 45° voxet loses one node in six to the nearest-node pick (checked in Node), at half of it every node keeps at least
// one block. The lattice is coarsened evenly past maxNodes (said by the caller).
export function alignedLattice(h, { maxNodes = 4e6 } = {}) {
  const { S, P0 } = nodeFrame(h), [nu, nv, nw] = h.n;
  const lens = S.map((v) => Math.hypot(...v));
  if (lens.some((l) => !(l > 0))) throw new Error("a Voxet axis has no length");
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [0, 1, 2].map((r) => [S[0][r], S[1][r], S[2][r]]), det = det3(M); // columns: the node steps
  if (!(Math.abs(det) > 1e-12 * lens[0] * lens[1] * lens[2])) throw new Error("the Voxet's axes are flat (they span no volume)");
  const inv = [0, 1, 2].map((r) => [0, 1, 2].map((c) => { // the inverse: cofactors transposed / det
    const rr = [0, 1, 2].filter((i) => i !== c), cc = [0, 1, 2].filter((i) => i !== r);
    return ((r + c) % 2 ? -1 : 1) * (M[rr[0]][cc[0]] * M[rr[1]][cc[1]] - M[rr[0]][cc[1]] * M[rr[1]][cc[0]]) / det;
  }));
  // the bounding box of the voxet's blocks (each node half a step out on every side)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const fi of [-0.5, nu - 0.5]) for (const fj of [-0.5, nv - 0.5]) for (const fk of [-0.5, nw - 0.5])
    for (let c = 0; c < 3; c++) { const v = P0[c] + fi * S[0][c] + fj * S[1][c] + fk * S[2][c]; lo[c] = Math.min(lo[c], v); hi[c] = Math.max(hi[c], v); }
  const step = [0, 1, 2].map((c) => {
    const along = lens.filter((l, a) => Math.abs(S[a][c]) >= 0.5 * l), base = along.length ? Math.min(...along) : Math.min(...lens);
    const crossed = S.some((v, a) => Math.abs(v[c]) > 1e-9 * lens[a] && Math.abs(v[c]) < lens[a] * (1 - 1e-9));
    return crossed ? base / 2 : base;
  });
  const n0 = step.map((d, c) => Math.max(1, Math.round((hi[c] - lo[c]) / d)));
  const total = n0[0] * n0[1] * n0[2];
  let n = n0;
  // an axis that bottoms out at one node leaves the others to shrink more, so the factor grows until the lattice fits
  for (let f = Math.cbrt(total / maxNodes); n[0] * n[1] * n[2] > maxNodes; f *= 1.05) n = n0.map((k) => Math.max(1, Math.floor(k / f)));
  const d = n.map((k, c) => (hi[c] - lo[c]) / k);
  const map = new Int32Array(n[0] * n[1] * n[2]).fill(-1);
  let o = 0;
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++, o++) {
    const q = [lo[0] + (i + 0.5) * d[0] - P0[0], lo[1] + (j + 0.5) * d[1] - P0[1], lo[2] + (k + 0.5) * d[2] - P0[2]];
    const fi = Math.round(inv[0][0] * q[0] + inv[0][1] * q[1] + inv[0][2] * q[2]), fj = Math.round(inv[1][0] * q[0] + inv[1][1] * q[1] + inv[1][2] * q[2]), fk = Math.round(inv[2][0] * q[0] + inv[2][1] * q[1] + inv[2][2] * q[2]);
    if (fi >= 0 && fi < nu && fj >= 0 && fj < nv && fk >= 0 && fk < nw) map[o] = fi + fj * nu + fk * nu * nv;
  }
  const header = { ...h, origin: [lo[0] + d[0] / 2, lo[1] + d[1] / 2, lo[2] + d[2] / 2], axes: { u: [d[0] * Math.max(1, n[0] - 1), 0, 0], v: [0, d[1] * Math.max(1, n[1] - 1), 0], w: [0, 0, d[2] * Math.max(1, n[2] - 1)] },
    min: [0, 0, 0], max: [1, 1, 1], n, zSign: 1 };
  const rotationDeg = ((Math.atan2(S[0][1], S[0][0]) * 180) / Math.PI + 360) % 360;
  return { header, map, rotationDeg, step: d, coarsened: total > maxNodes };
}

// one property's values (voxet order) -> the aligned lattice's values (NaN outside the voxet)
export function resampleVoxet(lattice, values) {
  const out = new Float64Array(lattice.map.length);
  for (let i = 0; i < out.length; i++) { const s = lattice.map[i]; out[i] = s >= 0 ? values[s] : NaN; }
  return out;
}
