// TASKS.csv #1994 — lidar point clouds: ASPRS LAS 1.0-1.4 (point formats 0-10), LAZ and COPC, read in the renderer.
//   - LAS: the point records are read straight from the file, a slice at a time (any size).
//   - LAZ: decoded by laz-perf (Apache-2.0, WASM, hobuinc/laz-perf). Its whole-file reader needs the file inside the WASM heap
//     (2 GB at most), so the file is copied in by slices (no second copy in JS) and refused above MAX_LAZ_BYTES.
//   - COPC (a LAZ 1.4 file whose chunks are octree nodes, copc.io): the hierarchy says how many points each depth holds, so
//     only the coarse levels that fit the point budget are read and decoded; a 10 GB COPC costs what its first levels cost.
//     The COPC info and hierarchy records are two small fixed layouts and are read here (copc.js would add cross-fetch for
//     nothing a local file needs).
// What comes out, in one pass over the points:
//   - a ground grid: the mean elevation of the ground-classified points (class 2) in each cell. A file with no ground class
//     gets the lowest point of each cell instead, and says so: that surface still has trees and roofs in it.
//   - a thinned cloud for the 3D View: 1 point in `keepEvery`, noise (classes 7 and 18) and withheld points left out.
//   - the count of each class.
// Coordinates stay in the file's CRS and units here; lidarResultToProject (below) moves them into the project.
// Pure: no React, no DOM; the worker (lidar.worker.js) and the Node tests run the same code.

export const MAX_LAZ_BYTES = 1.5e9; // the WASM heap is 2 GB: a bigger LAZ cannot be opened whole (convert it to COPC, or tile it)
export const COPC_POINT_BUDGET = 6e6; // octree levels are read while their running total stays under this
const SLICE = 32 * 1024 * 1024;

const ascii = (u8, at, n) => { let s = ""; for (let i = 0; i < n; i++) { const c = u8[at + i]; if (!c) break; s += String.fromCharCode(c); } return s; };
const u8of = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));

// true when the bytes start with the LAS signature: a lidar .las, not a LAS well log (a text file starting "~Version")
export function isLasPointCloud(bytes) {
  const u = u8of(bytes);
  return u.length >= 4 && u[0] === 0x4c && u[1] === 0x41 && u[2] === 0x53 && u[3] === 0x46; // "LASF"
}

// the public header block (the first 227 bytes; 375 for LAS 1.4)
export function parseLasHeader(bytes) {
  const u = u8of(bytes);
  if (!isLasPointCloud(u)) throw new Error("Not a lidar point cloud: the file does not start with the LAS signature (LASF).");
  if (u.length < 227) throw new Error("The LAS header is cut short.");
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const major = u[24], minor = u[25];
  const headerSize = dv.getUint16(94, true);
  const fmtByte = u[104];
  const h = {
    version: `${major}.${minor}`, major, minor, headerSize,
    offsetToPoints: dv.getUint32(96, true), numVlrs: dv.getUint32(100, true),
    pointFormat: fmtByte & 0x3f, compressed: (fmtByte & 0xc0) !== 0, recordLength: dv.getUint16(105, true),
    pointCount: dv.getUint32(107, true),
    scale: [131, 139, 147].map((o) => dv.getFloat64(o, true)), offset: [155, 163, 171].map((o) => dv.getFloat64(o, true)),
    max: [179, 195, 211].map((o) => dv.getFloat64(o, true)), min: [187, 203, 219].map((o) => dv.getFloat64(o, true)),
    software: ascii(u, 58, 32).trim(), evlrStart: 0, numEvlrs: 0,
  };
  if (minor >= 4 && headerSize >= 375 && u.length >= 375) {
    h.evlrStart = Number(dv.getBigUint64(235, true));
    h.numEvlrs = dv.getUint32(243, true);
    const n64 = Number(dv.getBigUint64(247, true));
    if (n64) h.pointCount = n64; // LAS 1.4 keeps the legacy count 0 for formats 6-10 and above 4.29 billion
  }
  if (h.pointFormat > 10) throw new Error(`Point format ${h.pointFormat} is not an ASPRS LAS point format (0-10).`);
  if (h.recordLength < BASE_LENGTH[h.pointFormat]) throw new Error(`Point records of ${h.recordLength} bytes are shorter than format ${h.pointFormat} needs (${BASE_LENGTH[h.pointFormat]}).`);
  if (!(h.scale.every((s) => s > 0))) throw new Error("The LAS header has no usable coordinate scale.");
  return h;
}
const BASE_LENGTH = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];

// variable-length records between the header and the points: [{ userId, recordId, data }]
export function parseVlrs(bytes, h) {
  const u = u8of(bytes), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = [];
  let p = h.headerSize;
  for (let i = 0; i < h.numVlrs && p + 54 <= u.length; i++) {
    const len = dv.getUint16(p + 20, true);
    out.push({ userId: ascii(u, p + 2, 16), recordId: dv.getUint16(p + 18, true), data: u.subarray(p + 54, Math.min(u.length, p + 54 + len)) });
    p += 54 + len;
  }
  return out;
}
// extended VLRs (LAS 1.4, after the points; COPC's hierarchy is one): bytes from h.evlrStart to the end of the file
export function parseEvlrs(bytes, h) {
  const u = u8of(bytes), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = [];
  let p = 0;
  for (let i = 0; i < h.numEvlrs && p + 60 <= u.length; i++) {
    const len = Number(dv.getBigUint64(p + 20, true));
    out.push({ userId: ascii(u, p + 2, 16), recordId: dv.getUint16(p + 18, true), fileOffset: h.evlrStart + p + 60, length: len, data: u.subarray(p + 60, Math.min(u.length, p + 60 + len)) });
    p += 60 + len;
  }
  return out;
}

// ---- the coordinate system: OGC WKT (LAS 1.4, record 2112) or GeoTIFF keys (record 34735) -------------------------------
const UNIT_CODES = { 9001: 1, 9002: 0.3048, 9003: 1200 / 3937, 9036: 1000 }; // metre, foot, US survey foot, kilometre
// the bracketed block starting at `at` ("PROJCS[ ... ]")
function block(s, at) {
  let d = 0;
  for (let i = s.indexOf("[", at); i >= 0 && i < s.length; i++) {
    if (s[i] === "[") d++; else if (s[i] === "]" && --d === 0) return s.slice(at, i + 1);
  }
  return s.slice(at);
}
function firstBlock(s, names) {
  for (const n of names) { const i = s.search(new RegExp(`\\b${n}\\[`)); if (i >= 0) return block(s, i); }
  return null;
}
// the code an outer WKT block ends with (its own AUTHORITY / ID is its last element)
const lastCode = (b) => { const m = [...(b || "").matchAll(/(?:AUTHORITY|ID)\["EPSG",\s*"?(\d+)"?\]/g)]; return m.length ? Number(m[m.length - 1][1]) : null; };
// the linear unit of a block, leaving out the ones inside a nested geographic CRS
const unitOf = (b) => {
  if (!b) return null;
  const inner = firstBlock(b.slice(1), ["GEOGCS", "BASEGEOGCRS", "BASEGEODCRS"]);
  const rest = inner ? b.replace(inner, "") : b;
  const m = [...rest.matchAll(/(?:LENGTHUNIT|UNIT)\["([^"]*)",\s*([\d.eE+-]+)/g)].filter((x) => !/degree|radian|grad/i.test(x[1]));
  return m.length ? Number(m[m.length - 1][2]) : null;
};
export function crsFromVlrs(vlrs) {
  const wktV = vlrs.find((v) => v.userId === "LASF_Projection" && v.recordId === 2112);
  if (wktV) {
    const wkt = ascii(wktV.data, 0, wktV.data.length);
    const proj = firstBlock(wkt, ["PROJCS", "PROJCRS"]), geog = proj ? null : firstBlock(wkt, ["GEOGCS", "GEOGCRS", "GEODCRS"]);
    const vert = firstBlock(wkt, ["VERT_CS", "VERTCRS"]);
    const name = (wkt.match(/^\s*\w+\["([^"]*)"/) || [])[1] || null;
    const hUnit = proj ? unitOf(proj) : null;
    return { source: "wkt", epsg: lastCode(proj || geog), vertEpsg: lastCode(vert), name, hUnit, zUnit: vert ? unitOf(vert) : null, wkt };
  }
  const gk = vlrs.find((v) => v.userId === "LASF_Projection" && v.recordId === 34735);
  if (gk && gk.data.length >= 8) {
    const dv = new DataView(gk.data.buffer, gk.data.byteOffset, gk.data.byteLength), n = dv.getUint16(6, true), keys = {};
    for (let i = 0; i < n && 8 + i * 8 + 8 <= gk.data.length; i++) {
      const o = 8 + i * 8, id = dv.getUint16(o, true), loc = dv.getUint16(o + 2, true), val = dv.getUint16(o + 6, true);
      if (loc === 0) keys[id] = val; // a short stored in the key itself (the codes and units are)
    }
    const code = (k) => (keys[k] && keys[k] !== 32767 ? keys[k] : null); // 32767 = user-defined
    const ascii34737 = vlrs.find((v) => v.userId === "LASF_Projection" && v.recordId === 34737);
    return { source: "geokeys", epsg: code(3072) ?? code(2048), vertEpsg: code(4096), name: ascii34737 ? ascii(ascii34737.data, 0, ascii34737.data.length).split("|")[0] || null : null,
      hUnit: UNIT_CODES[keys[3076]] ?? null, zUnit: UNIT_CODES[keys[4099]] ?? null };
  }
  return { source: null, epsg: null, vertEpsg: null, name: null, hUnit: null, zUnit: null };
}

// ---- COPC -------------------------------------------------------------------------------------------------------------
export function copcInfo(vlrs) {
  const v = vlrs.find((x) => x.userId === "copc" && x.recordId === 1);
  if (!v || v.data.length < 160) return null;
  const dv = new DataView(v.data.buffer, v.data.byteOffset, v.data.byteLength);
  return { center: [0, 8, 16].map((o) => dv.getFloat64(o, true)), halfsize: dv.getFloat64(24, true), spacing: dv.getFloat64(32, true),
    rootHierOffset: Number(dv.getBigUint64(40, true)), rootHierSize: Number(dv.getBigUint64(48, true)) };
}
// one hierarchy page: 32-byte entries; pointCount -1 = a child page at offset / byteSize, 0 = an empty node
export function parseHierarchyPage(bytes) {
  const u = u8of(bytes), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = [];
  for (let p = 0; p + 32 <= u.length; p += 32) {
    out.push({ depth: dv.getInt32(p, true), key: [dv.getInt32(p, true), dv.getInt32(p + 4, true), dv.getInt32(p + 8, true), dv.getInt32(p + 12, true)].join("-"),
      offset: Number(dv.getBigUint64(p + 16, true)), byteSize: dv.getInt32(p + 24, true), pointCount: dv.getInt32(p + 28, true) });
  }
  return out;
}
// the deepest levels whose points, added up from the root, stay within the budget (the root level always)
export function copcLevelsWithin(nodes, budget = COPC_POINT_BUDGET) {
  const byDepth = new Map();
  for (const n of nodes) if (n.pointCount > 0) byDepth.set(n.depth, (byDepth.get(n.depth) || 0) + n.pointCount);
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  let total = 0, maxDepth = depths[0] ?? 0;
  for (const d of depths) { if (d > depths[0] && total + byDepth.get(d) > budget) break; total += byDepth.get(d); maxDepth = d; }
  return { maxDepth, points: total, levels: depths.length, allPoints: [...byDepth.values()].reduce((a, b) => a + b, 0) };
}

// ---- the points -------------------------------------------------------------------------------------------------------
// offsets of the fields read: X Y Z (int32 at 0 4 8), intensity (uint16 at 12), classification and the withheld flag
export function pointLayout(format) {
  return format >= 6
    ? { cls: (dv, o) => dv.getUint8(o + 16), withheld: (dv, o) => (dv.getUint8(o + 15) & 0x04) !== 0 }
    : { cls: (dv, o) => dv.getUint8(o + 15) & 0x1f, withheld: (dv, o) => (dv.getUint8(o + 15) & 0x80) !== 0 };
}
export const NOISE_CLASSES = new Set([7, 18]); // low and high noise
export const CLASS_NAMES = { 0: "Never classified", 1: "Unclassified", 2: "Ground", 3: "Low vegetation", 4: "Medium vegetation", 5: "High vegetation", 6: "Building", 7: "Low noise", 8: "Model key point", 9: "Water", 10: "Rail", 11: "Road surface", 12: "Overlap", 13: "Wire guard", 14: "Wire conductor", 15: "Transmission tower", 16: "Wire connector", 17: "Bridge deck", 18: "High noise" };

// cloudClasses: "all" (noise left out), "ground", "nonground"
export function makeAccumulator(h, { cellSize, keepEvery = 1, maxCloud = 2e6, cloudClasses = "all", wantCloud = true } = {}) {
  const [x0, y0] = h.min, [x1, y1] = h.max;
  const span = Math.max(x1 - x0, y1 - y0);
  const cell = cellSize > 0 ? cellSize : span / 200;
  // floor + 1: a point on the header's maximum (x = x1) falls in the last cell, not past it
  const gridW = Math.max(2, Math.floor((x1 - x0) / cell) + 1 || 2), gridH = Math.max(2, Math.floor((y1 - y0) / cell) + 1 || 2);
  const nCells = gridW * gridH;
  const gSum = new Float64Array(nCells), gCount = new Uint32Array(nCells), low = new Float32Array(nCells).fill(Infinity);
  const classCounts = new Uint32Array(256);
  const cap = wantCloud ? Math.max(0, Math.min(maxCloud, Math.ceil(h.pointCount / Math.max(1, keepEvery)) + 1)) : 0;
  const cx = new Float64Array(cap), cy = new Float64Array(cap), cz = new Float32Array(cap), ci = new Uint16Array(cap), cc = new Uint8Array(cap);
  const [sx, sy, sz] = h.scale, [ox, oy, oz] = h.offset, L = pointLayout(h.pointFormat);
  let nCloud = 0, eligible = 0, seen = 0, withheld = 0, noise = 0, outside = 0;
  const add = (dv, o) => {
    seen++;
    if (L.withheld(dv, o)) { withheld++; return; }
    const cls = L.cls(dv, o);
    classCounts[cls]++;
    if (NOISE_CLASSES.has(cls)) { noise++; return; }
    const x = dv.getInt32(o, true) * sx + ox, y = dv.getInt32(o + 4, true) * sy + oy, z = dv.getInt32(o + 8, true) * sz + oz;
    // a point up to one cell past the header's extent (rounding in the writer) goes in the edge cell; further out it is counted
    // (a header extent that is wrong) and kept in the cloud only
    let i = Math.floor((x - x0) / cell), j = Math.floor((y1 - y) / cell);
    if (i === -1 || i === gridW) i = i < 0 ? 0 : gridW - 1;
    if (j === -1 || j === gridH) j = j < 0 ? 0 : gridH - 1;
    if (i < 0 || j < 0 || i >= gridW || j >= gridH) outside++;
    else {
      const k = j * gridW + i;
      if (cls === 2) { gSum[k] += z; gCount[k]++; }
      if (z < low[k]) low[k] = z;
    }
    if (!cap) return;
    if (cloudClasses === "ground" ? cls !== 2 : cloudClasses === "nonground" ? cls === 2 : false) return;
    if (eligible++ % keepEvery !== 0 || nCloud >= cap) return;
    cx[nCloud] = x; cy[nCloud] = y; cz[nCloud] = z; ci[nCloud] = dv.getUint16(o + 12, true); cc[nCloud] = cls; nCloud++;
  };
  const result = () => ({
    grid: { gridW, gridH, cell, xmin: x0, ymax: y1, gSum, gCount, low },
    cloud: { n: nCloud, x: cx.subarray(0, nCloud), y: cy.subarray(0, nCloud), z: cz.subarray(0, nCloud), intensity: ci.subarray(0, nCloud), cls: cc.subarray(0, nCloud), eligible, keepEvery, capped: eligible > 0 && nCloud >= cap && Math.ceil(eligible / keepEvery) > cap },
    classCounts: Object.fromEntries([...classCounts.entries()].filter(([, n]) => n)), seen, withheld, noise, outside,
  });
  return { add, result };
}

// the ground grid: ground means where there are ground points, empty cells filled from their neighbours for up to
// `fillPasses` cells (under a building, a pond, a gap between flight lines), the rest no-data. Without a single ground point the
// lowest point of each cell is used and `from` says "lowest".
export function groundSurface(grid, { fillPasses = 10 } = {}) {
  const { gridW, gridH, cell, xmin, ymax, gSum, gCount, low } = grid, n = gridW * gridH;
  let ground = 0;
  for (let k = 0; k < n; k++) if (gCount[k]) ground++;
  const from = ground ? "ground" : "lowest";
  let z = new Float64Array(n).fill(NaN);
  for (let k = 0; k < n; k++) z[k] = ground ? (gCount[k] ? gSum[k] / gCount[k] : NaN) : (Number.isFinite(low[k]) ? low[k] : NaN);
  const measured = ground || z.reduce((a, v) => a + (v === v ? 1 : 0), 0);
  let filled = 0;
  for (let pass = 0; pass < fillPasses; pass++) {
    const next = Float64Array.from(z);
    let changed = 0;
    for (let j = 0; j < gridH; j++) for (let i = 0; i < gridW; i++) {
      const k = j * gridW + i;
      if (z[k] === z[k]) continue;
      let s = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if ((di || dj) && ii >= 0 && jj >= 0 && ii < gridW && jj < gridH) { const v = z[jj * gridW + ii]; if (v === v) { s += v; c++; } }
      }
      if (c >= 2) { next[k] = s / c; changed++; } // two neighbours at least: a lone corner does not grow a spur
    }
    z = next; filled += changed;
    if (!changed) break;
  }
  const empty = n - measured - filled;
  // node centres, row 0 = north (the terrain convention)
  const bbox = [xmin + cell / 2, ymax - (gridH - 0.5) * cell, xmin + (gridW - 0.5) * cell, ymax - cell / 2];
  return { gridW, gridH, cell, bbox, z, from, measured, filled, empty, fillCells: fillPasses };
}

// ---- reading a file -----------------------------------------------------------------------------------------------------
// src: { size, read(begin, end) -> Promise<Uint8Array> }. Header, records, CRS, COPC info and hierarchy; no points decoded.
export async function inspectLidar(src) {
  const head = await src.read(0, Math.min(src.size, 375));
  const h = parseLasHeader(head);
  const pre = await src.read(0, Math.min(src.size, h.offsetToPoints));
  const vlrs = parseVlrs(pre, h);
  let evlrs = [];
  if (h.numEvlrs && h.evlrStart > 0 && h.evlrStart < src.size) evlrs = parseEvlrs(await src.read(h.evlrStart, src.size), h);
  const crs = crsFromVlrs([...vlrs, ...evlrs]);
  const copc = h.compressed ? copcInfo(vlrs) : null;
  let nodes = null;
  if (copc) {
    nodes = [];
    const pages = [{ offset: copc.rootHierOffset, byteSize: copc.rootHierSize }];
    for (let guard = 0; pages.length && guard < 100000; guard++) {
      const pg = pages.shift();
      for (const e of parseHierarchyPage(await src.read(pg.offset, pg.offset + pg.byteSize))) {
        if (e.pointCount === -1) pages.push(e); else if (e.pointCount > 0) nodes.push(e);
      }
    }
  }
  return { header: h, vlrs: vlrs.map(({ userId, recordId }) => ({ userId, recordId })), crs, copc, nodes, kind: copc ? "COPC" : h.compressed ? "LAZ" : "LAS" };
}

// every point (LAS, LAZ) or the COPC levels within the budget, through an accumulator. lazPerf: a laz-perf module (its
// factory's resolved value). onProgress(fraction).
export async function readLidar(src, info, opts = {}, { lazPerf = null, onProgress = () => {} } = {}) {
  const h = info.header, acc = makeAccumulator(h, opts), R = h.recordLength;
  let read = { kind: info.kind, points: h.pointCount };
  if (info.kind === "LAS") {
    const per = Math.max(1, Math.floor(SLICE / R)), end = h.offsetToPoints + h.pointCount * R;
    for (let p = h.offsetToPoints, done = 0; p < end && p < src.size; p += per * R) {
      const u = await src.read(p, Math.min(end, src.size, p + per * R)), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      for (let o = 0; o + R <= u.length; o += R) acc.add(dv, o);
      done += Math.floor(u.length / R);
      onProgress(done / h.pointCount);
    }
  } else if (!lazPerf) {
    throw new Error("LAZ decoding is not available.");
  } else if (info.kind === "COPC") {
    const lv = copcLevelsWithin(info.nodes, opts.copcBudget ?? COPC_POINT_BUDGET);
    const todo = info.nodes.filter((n) => n.depth <= lv.maxDepth).sort((a, b) => a.offset - b.offset);
    let done = 0;
    for (const n of todo) {
      const u = await src.read(n.offset, n.offset + n.byteSize);
      decodeChunk(lazPerf, u, h, n.pointCount, acc.add);
      done += n.pointCount;
      onProgress(done / lv.points);
    }
    read = { kind: "COPC", points: lv.points, allPoints: lv.allPoints, maxDepth: lv.maxDepth, levels: lv.levels };
  } else {
    if (src.size > MAX_LAZ_BYTES) throw new Error(`This LAZ file is ${(src.size / 1e9).toFixed(1)} GB: above ${(MAX_LAZ_BYTES / 1e9).toFixed(1)} GB it cannot be decoded whole in the app. Convert it to COPC (PDAL or untwine), which is read a level at a time, or split it into tiles.`);
    await decodeLaz(lazPerf, src, h, acc.add, onProgress);
  }
  return { ...acc.result(), read };
}

// a COPC node: one LAZ chunk
function decodeChunk(LP, bytes, h, count, add) {
  const R = h.recordLength;
  let blob = 0, pt = 0, dec = null;
  try {
    blob = LP._malloc(bytes.length); pt = LP._malloc(R);
    LP.HEAPU8.set(bytes, blob);
    dec = new LP.ChunkDecoder();
    dec.open(h.pointFormat, R, blob);
    let dv = new DataView(LP.HEAPU8.buffer);
    for (let i = 0; i < count; i++) {
      dec.getPoint(pt);
      if (dv.buffer !== LP.HEAPU8.buffer) dv = new DataView(LP.HEAPU8.buffer); // the heap grew
      add(dv, pt);
    }
  } finally {
    if (blob) LP._free(blob); if (pt) LP._free(pt); dec?.delete();
  }
}

// a whole LAZ file: copied into the WASM heap a slice at a time, then read point by point
async function decodeLaz(LP, src, h, add, onProgress) {
  {
    const R = h.recordLength;
    let blob = 0, pt = 0, zip = null;
    try {
      blob = LP._malloc(src.size);
      if (!blob) throw new Error("Not enough memory to open this LAZ file.");
      for (let p = 0; p < src.size; p += SLICE) { const u = await src.read(p, Math.min(src.size, p + SLICE)); LP.HEAPU8.set(u, blob + p); onProgress((0.1 * p) / src.size); }
      pt = LP._malloc(R);
      zip = new LP.LASZip();
      zip.open(blob, src.size);
      const n = Math.min(h.pointCount, zip.getCount());
      let dv = new DataView(LP.HEAPU8.buffer);
      const step = Math.max(1, Math.floor(n / 50));
      for (let i = 0; i < n; i++) {
        zip.getPoint(pt);
        if (dv.buffer !== LP.HEAPU8.buffer) dv = new DataView(LP.HEAPU8.buffer);
        add(dv, pt);
        if (i % step === 0) onProgress(0.1 + (0.9 * i) / n);
      }
    } finally {
      zip?.delete(); if (pt) LP._free(pt); if (blob) LP._free(blob);
    }
  }
}

// ---- into the project ----------------------------------------------------------------------------------------------------
// The file's CRS against the project's: reproject (a function (x, y) -> { x, y } | null, from the file's EPSG to the project's,
// or null when they are the same). zToProject: the factor that turns the file's heights into the project's (1 when they match).
// -> { terrain: { kind: "grid", ... } | { kind: "points", points } | null, rows (the cloud as point-survey rows), notes }
export function lidarResultToProject(res, { reproject = null, zFactor = 1, hFactor = 1, colourBy = "elevation", src = "lidar", wantTerrain = true } = {}) {
  let terrain = null, surface = null;
  if (wantTerrain) {
    surface = groundSurface(res.grid);
    const usable = surface.measured + surface.filled;
    if (usable >= 4) {
      if (!reproject) {
        const el = new Array(surface.z.length);
        for (let k = 0; k < el.length; k++) el[k] = surface.z[k] === surface.z[k] ? surface.z[k] * zFactor : NaN;
        terrain = { kind: "grid", gridW: surface.gridW, gridH: surface.gridH, bbox: surface.bbox, values: el };
      } else {
        const pts = [];
        for (let j = 0; j < surface.gridH; j++) for (let i = 0; i < surface.gridW; i++) {
          const v = surface.z[j * surface.gridW + i];
          if (v !== v) continue;
          const q = reproject(surface.bbox[0] + i * surface.cell, surface.bbox[3] - j * surface.cell);
          if (q) pts.push({ x: q.x, y: q.y, z: v * zFactor });
        }
        terrain = { kind: "points", points: pts };
      }
    }
  }
  const c = res.cloud, rows = [];
  for (let k = 0; k < c.n; k++) {
    let x = c.x[k], y = c.y[k];
    if (reproject) { const q = reproject(x, y); if (!q) continue; x = q.x; y = q.y; }
    const z = c.z[k] * zFactor;
    rows.push({ x, y, z, value: colourBy === "intensity" ? c.intensity[k] : colourBy === "class" ? c.cls[k] : z, cls: c.cls[k], _src: src });
  }
  return { terrain, surface: surface && { gridW: surface.gridW, gridH: surface.gridH, cellM: surface.cell * hFactor, from: surface.from, measured: surface.measured, filled: surface.filled, empty: surface.empty, fillM: surface.fillCells * surface.cell * hFactor }, rows };
}

// a File (or Blob) as a src for inspectLidar / readLidar
export const fileSource = (file) => ({ size: file.size, read: (a, b) => file.slice(a, b).arrayBuffer().then((x) => new Uint8Array(x)) });
