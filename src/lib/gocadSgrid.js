// TASKS.csv #2726 (split from #2692) — a GOCAD SGrid (.sg) as a block model. Written from the format as it is publicly documented (clean
// room), as lib/gocadVoxet.js was. An SGrid is a curvilinear (stratigraphic) grid: an ASCII header naming binary side files,
//   GOCAD SGrid 1 / HEADER { name:… } / ZPOSITIVE Depth (in GOCAD_ORIGINAL_COORDINATE_SYSTEM) / AXIS_N nu nv nw
//   PROP_ALIGNMENT POINTS | CELLS      the properties sit on the nodes (default) or on the cells ((nu-1)(nv-1)(nw-1) values)
//   POINTS_FILE model__points@@ / POINTS_OFFSET 0     every node's x y z, big-endian 4-byte floats, u fastest, then v, then w
//   FLAGS_FILE … (cell flags: not read)
//   PROPERTY 1 Density / PROP_FILE 1 model__Density@@ / PROP_ESIZE / PROP_ETYPE / PROP_NO_DATA_VALUE / PROP_UNIT / PROP_OFFSET (as a Voxet)
// A block model here is east / north / up blocks, so the SGrid's samples (its nodes, or its cell centres) are RESAMPLED onto such a
// lattice: each block takes the value of the nearest sample within one cell of it, blocks farther from every sample are left empty. A
// header with an ASCII_DATA_FILE (points and values in one text file) is refused with the reason (not read yet). Pure: no DOM.
import { readVoxetValues } from "./gocadVoxet.js";
import { median } from "./arrayStats.js"; // TASKS.csv #1114 — the one median

const nums = (s) => String(s).trim().split(/\s+/).map(Number);

// header text -> { name, n: [nu, nv, nw], zSign, align: "POINTS" | "CELLS", pointsFile, pointsOffset, asciiFile, props: [...] }
export function parseSgridHeader(text) {
  const h = { name: "", n: null, zSign: 1, align: "POINTS", pointsFile: "", pointsOffset: 0, asciiFile: "", props: [] };
  const prop = (id) => { let p = h.props.find((q) => q.id === id); if (!p) h.props.push((p = { id, name: `property ${id}`, file: "", esize: 4, etype: "IEEE", noData: null, unit: "", offset: 0, signed: true, format: "RAW" })); return p; };
  let inHeader = false, saw = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    if (/^GOCAD\s+SGrid/i.test(line)) { saw = true; continue; }
    if (/^HEADER\s*\{/i.test(line)) { inHeader = !/\}\s*$/.test(line); const m = /name\s*:\s*([^}]+)/i.exec(line); if (m) h.name = m[1].trim(); continue; }
    if (inHeader) { if (line.startsWith("}")) inHeader = false; else { const m = /^\*?name\s*:\s*(.+)$/i.exec(line); if (m && !h.name) h.name = m[1].trim(); } continue; }
    const sp = line.indexOf(" "), kw = (sp < 0 ? line : line.slice(0, sp)).toUpperCase(), rest = sp < 0 ? "" : line.slice(sp + 1).trim();
    if (kw === "ZPOSITIVE") { h.zSign = /depth/i.test(rest) ? -1 : 1; continue; }
    if (kw === "AXIS_N") { h.n = nums(rest).map((v) => Math.round(v)); continue; }
    if (kw === "PROP_ALIGNMENT") { h.align = /cell/i.test(rest) ? "CELLS" : "POINTS"; continue; }
    if (kw === "POINTS_FILE") { h.pointsFile = rest; continue; }
    if (kw === "POINTS_OFFSET") { h.pointsOffset = Number(rest) || 0; continue; }
    if (kw === "ASCII_DATA_FILE") { h.asciiFile = rest; continue; }
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
  if (!saw) throw new Error("not a GOCAD SGrid (no 'GOCAD SGrid' line)");
  if (!h.n || h.n.length < 3 || h.n.some((k) => !(k >= 2))) throw new Error("the SGrid header lacks AXIS_N (at least 2 nodes along each axis)");
  if (!h.pointsFile && h.asciiFile) throw new Error(`its points and values are in an ASCII data file (${h.asciiFile}), which GeoStrix does not read yet: export the SGrid with binary files (POINTS_FILE, PROP_FILE)`);
  if (!h.pointsFile) throw new Error("the SGrid header names no POINTS_FILE");
  return h;
}

// the node positions, world x y z (z up): Float64Array of 3 * nu * nv * nw
export function readSgridPoints(bytes, h) {
  const n = h.n[0] * h.n[1] * h.n[2], u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const off = h.pointsOffset || 0;
  if (u8.byteLength < off + n * 12) throw new Error(`its points file holds ${u8.byteLength.toLocaleString()} bytes, ${(off + n * 12).toLocaleString()} expected (${n.toLocaleString()} nodes of three 4-byte numbers)`);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = dv.getFloat32(off + i * 4, false);
  if (h.zSign < 0) for (let i = 2; i < out.length; i += 3) out[i] = -out[i];
  return out;
}

// the samples the properties sit on: nodes (POINTS) or cell centres (CELLS, the mean of each cell's 8 corner nodes). -> { xyz, count, dims }
export function sgridSamples(h, points) {
  const [nu, nv, nw] = h.n;
  if (h.align !== "CELLS") return { xyz: points, count: nu * nv * nw, dims: [nu, nv, nw] };
  const cu = nu - 1, cv = nv - 1, cw = nw - 1, xyz = new Float64Array(cu * cv * cw * 3);
  let o = 0;
  for (let k = 0; k < cw; k++) for (let j = 0; j < cv; j++) for (let i = 0; i < cu; i++) {
    let x = 0, y = 0, z = 0;
    for (const dk of [0, 1]) for (const dj of [0, 1]) for (const di of [0, 1]) { const p = 3 * (i + di + (j + dj) * nu + (k + dk) * nu * nv); x += points[p]; y += points[p + 1]; z += points[p + 2]; }
    xyz[o++] = x / 8; xyz[o++] = y / 8; xyz[o++] = z / 8;
  }
  return { xyz, count: cu * cv * cw, dims: [cu, cv, cw] };
}


// the samples -> an east / north / up lattice: { header (an aligned Voxet header: lib/gocadVoxet.js voxetToUbc reads it), map (each lattice
// node -> the nearest sample within `reach`, -1 none), step: [dx, dy, dz], reach, coarsened }. Each world axis takes the median sample spacing
// of the SGrid axis running mostly along it (the finest when several do); reach = the longest of the three median spacings (one cell).
export function sgridLattice({ xyz, count, dims }, { maxNodes = 2e6 } = {}) {
  const [a, b, c] = dims, idx = (i, j, k) => i + j * a + k * a * b;
  const steps = [[], [], []]; // per SGrid axis: step vectors between neighbouring samples (a sample of them, to stay quick)
  const every = Math.max(1, Math.floor(count / 20000));
  for (let s = 0; s < count; s += every) {
    const i = s % a, j = Math.floor(s / a) % b, k = Math.floor(s / (a * b));
    const nb = [i + 1 < a ? idx(i + 1, j, k) : -1, j + 1 < b ? idx(i, j + 1, k) : -1, k + 1 < c ? idx(i, j, k + 1) : -1];
    nb.forEach((t, ax) => { if (t >= 0) { const v = [xyz[3 * t] - xyz[3 * s], xyz[3 * t + 1] - xyz[3 * s + 1], xyz[3 * t + 2] - xyz[3 * s + 2]]; if (v.every(Number.isFinite)) steps[ax].push(v); } });
  }
  const len = steps.map((list) => median(list.map((v) => Math.hypot(...v))));
  const dir = steps.map((list) => [0, 1, 2].map((cc) => median(list.map((v) => Math.abs(v[cc])))));
  const known = len.filter((l) => l > 0);
  if (!known.length) throw new Error("its nodes do not move from one to the next (the points file holds no grid)");
  const reach = Math.max(...known);
  const step = [0, 1, 2].map((cc) => { const along = [0, 1, 2].filter((ax) => len[ax] > 0 && dir[ax][cc] >= 0.5 * len[ax]).map((ax) => len[ax]); return along.length ? Math.min(...along) : Math.min(...known); });
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let s = 0; s < count; s++) for (let cc = 0; cc < 3; cc++) { const v = xyz[3 * s + cc]; if (Number.isFinite(v)) { if (v < lo[cc]) lo[cc] = v; if (v > hi[cc]) hi[cc] = v; } }
  for (let cc = 0; cc < 3; cc++) { lo[cc] -= step[cc] / 2; hi[cc] += step[cc] / 2; }
  const n0 = step.map((d, cc) => Math.max(1, Math.round((hi[cc] - lo[cc]) / d)));
  const total = n0[0] * n0[1] * n0[2];
  let n = n0;
  for (let f = Math.cbrt(total / maxNodes); n[0] * n[1] * n[2] > maxNodes; f *= 1.05) n = n0.map((k) => Math.max(1, Math.floor(k / f)));
  const d = n.map((k, cc) => (hi[cc] - lo[cc]) / k);
  // a bucket grid of the samples, buckets one reach wide: the nearest sample within reach is in the 27 buckets around a node
  const bx = Math.max(1, Math.ceil((hi[0] - lo[0]) / reach)), by = Math.max(1, Math.ceil((hi[1] - lo[1]) / reach)), bz = Math.max(1, Math.ceil((hi[2] - lo[2]) / reach));
  const bucketOf = (x, y, z) => [Math.min(bx - 1, Math.max(0, Math.floor((x - lo[0]) / reach))), Math.min(by - 1, Math.max(0, Math.floor((y - lo[1]) / reach))), Math.min(bz - 1, Math.max(0, Math.floor((z - lo[2]) / reach)))];
  const head = new Int32Array(bx * by * bz).fill(-1), next = new Int32Array(count).fill(-1);
  for (let s = 0; s < count; s++) { const x = xyz[3 * s], y = xyz[3 * s + 1], z = xyz[3 * s + 2]; if (![x, y, z].every(Number.isFinite)) continue; const [i, j, k] = bucketOf(x, y, z), q = i + j * bx + k * bx * by; next[s] = head[q]; head[q] = s; }
  const map = new Int32Array(n[0] * n[1] * n[2]).fill(-1), r2 = reach * reach;
  let o = 0;
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++, o++) {
    const x = lo[0] + (i + 0.5) * d[0], y = lo[1] + (j + 0.5) * d[1], z = lo[2] + (k + 0.5) * d[2], [ci, cj, ck] = bucketOf(x, y, z);
    let best = -1, bd = r2;
    for (let kk = Math.max(0, ck - 1); kk <= Math.min(bz - 1, ck + 1); kk++) for (let jj = Math.max(0, cj - 1); jj <= Math.min(by - 1, cj + 1); jj++) for (let ii = Math.max(0, ci - 1); ii <= Math.min(bx - 1, ci + 1); ii++)
      for (let s = head[ii + jj * bx + kk * bx * by]; s >= 0; s = next[s]) { const dd = (xyz[3 * s] - x) ** 2 + (xyz[3 * s + 1] - y) ** 2 + (xyz[3 * s + 2] - z) ** 2; if (dd <= bd) { bd = dd; best = s; } }
    map[o] = best;
  }
  const header = { name: "", origin: [lo[0] + d[0] / 2, lo[1] + d[1] / 2, lo[2] + d[2] / 2], axes: { u: [d[0] * Math.max(1, n[0] - 1), 0, 0], v: [0, d[1] * Math.max(1, n[1] - 1), 0], w: [0, 0, d[2] * Math.max(1, n[2] - 1)] },
    min: [0, 0, 0], max: [1, 1, 1], n, zSign: 1, props: [] };
  return { header, map, step: d, reach, coarsened: total > maxNodes };
}

// one property's values (sample order) -> the lattice's values (NaN where no sample is within reach)
export function resampleSgrid(lattice, values) {
  const out = new Float64Array(lattice.map.length);
  for (let i = 0; i < out.length; i++) { const s = lattice.map[i]; out[i] = s >= 0 ? values[s] : NaN; }
  return out;
}

// the property values of one PROP_FILE: count = the samples' count (nodes, or cells for PROP_ALIGNMENT CELLS)
export const readSgridValues = (bytes, prop, count) => readVoxetValues(bytes, prop, count);
