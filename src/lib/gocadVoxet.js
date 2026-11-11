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
// becomes a block centred on it, one node step wide. Only an AXIS-ALIGNED voxet is read (U along x, V along y, W along z, any sign): a
// rotated one is refused with the reason, never drawn as if it were aligned. Pure: no DOM, no three.js.

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
