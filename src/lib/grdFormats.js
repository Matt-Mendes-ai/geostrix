// TASKS.csv #1347 — binary .grd grids: Geosoft (Oasis montaj) and Surfer 6 / 7. The Sample Data folder holds 715 Geosoft grids
// (ZTEM, mag, IP: 702 zlib-compressed float32, 13 uncompressed int16) and 20 Surfer 7 grids, and the import called the Geosoft
// format closed; Geosoft documents it. Pure: bytes in, a grid out; the caller inflates zlib blocks (DecompressionStream).
//
// Geosoft: a 512-byte header (little-endian) - ES (bytes per element, + 1024 when compressed), SF (0 unsigned, 1 signed, 2 float),
// NE (elements per vector), NV (vectors), KX (1: vectors are rows along X, -1: columns along Y); DE, DV (spacing), X0, Y0 (the
// first point, south-west), ROT (degrees); ZBASE, ZMULT (value = stored / ZMULT + ZBASE). Data from byte 512, the first vector
// at Y0. Compressed: a 16-byte block table header (signature, compression type, blocks, vectors per block), the blocks' int64
// offsets and int32 sizes, each block a 16-byte header then a zlib stream of whole vectors. Dummies: -1e32 (float), the type's
// minimum + 1 (signed), the maximum (unsigned).
// Surfer 7: tagged sections 'DSRB' / 'GRID' (rows, cols, xLL, yLL, xSize, ySize, zMin, zMax, rotation, blank) / 'DATA' (doubles,
// south row first). Surfer 6: 'DSBB', int16 nx, ny, doubles x/y/z ranges, float32 values south row first, blank 1.70141e38.

export function grdKind(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4) return null;
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (tag === "DSRB") return "surfer7";
  if (tag === "DSBB") return "surfer6";
  if (tag === "DSAA") return "surferAscii";
  if (b.length >= 512) {
    const dv = new DataView(b.buffer, b.byteOffset, 512);
    const es = dv.getInt32(0, true), ne = dv.getInt32(8, true), nv = dv.getInt32(12, true), kx = dv.getInt32(16, true);
    const size = es > 1024 ? es - 1024 : es;
    if ([1, 2, 4, 8].includes(size) && ne > 0 && nv > 0 && (kx === 1 || kx === -1)) return es > 1024 ? "geosoftCompressed" : "geosoft";
  }
  return null;
}

// -> { ncols, nrows, x0, y0, dx, dy, rotation, values (Float64Array, rows south -> north, each west -> east, NaN = no data), kind,
//      compressed, elementType } ; inflate(Uint8Array) -> Promise<Uint8Array> (zlib, with its 2-byte header)
export async function decodeGrd(bytes, inflate) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const kind = grdKind(b);
  if (!kind) throw new Error("Not a Geosoft or Surfer binary grid (no recognisable header).");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (kind === "surfer7") return surfer7(b, dv);
  if (kind === "surfer6") return surfer6(dv);
  if (kind === "surferAscii") return surferAscii(b);
  return geosoft(b, dv, kind === "geosoftCompressed", inflate);
}

async function geosoft(b, dv, compressed, inflate) {
  const es = dv.getInt32(0, true), sf = dv.getInt32(4, true), ne = dv.getInt32(8, true), nv = dv.getInt32(12, true), kx = dv.getInt32(16, true);
  const de = dv.getFloat64(20, true), dvv = dv.getFloat64(28, true), x0 = dv.getFloat64(36, true), y0 = dv.getFloat64(44, true), rot = dv.getFloat64(52, true);
  const zbase = dv.getFloat64(60, true), zmult = dv.getFloat64(68, true) || 1;
  const size = compressed ? es - 1024 : es;
  const total = ne * nv;
  if (!(total > 0) || total > 2e8) throw new Error(`The grid declares ${ne} x ${nv} values: not a grid this can read.`);
  let raw;
  if (!compressed) {
    if (b.length < 512 + total * size) throw new Error(`The grid is truncated: ${b.length} bytes for ${ne} x ${nv} values of ${size} bytes.`);
    raw = new DataView(b.buffer, b.byteOffset + 512, total * size);
  } else {
    if (!inflate) throw new Error("This Geosoft grid is compressed and no decompressor was given.");
    const nb = dv.getInt32(520, true);
    if (!(nb > 0) || nb > 1e6) throw new Error("The compressed grid's block table is not readable.");
    const offs = [], sizes = [];
    for (let i = 0; i < nb; i++) offs.push(Number(dv.getBigInt64(528 + 8 * i, true)));
    for (let i = 0; i < nb; i++) sizes.push(dv.getInt32(528 + 8 * nb + 4 * i, true));
    const out = new Uint8Array(total * size);
    let at = 0;
    for (let i = 0; i < nb; i++) {
      const o = offs[i], s = sizes[i];
      if (!(o >= 0 && s > 16 && o + s <= b.length)) throw new Error(`Compressed block ${i + 1} of ${nb} points outside the file.`);
      const part = await inflate(b.subarray(o + 16, o + s));
      out.set(part.subarray(0, Math.min(part.length, out.length - at)), at);
      at += part.length;
    }
    if (at < out.length) throw new Error(`The compressed grid holds ${at} bytes of values, ${out.length} expected.`);
    raw = new DataView(out.buffer, 0, out.length);
  }
  const read = size === 1 ? (sf === 0 ? (i) => raw.getUint8(i) : (i) => raw.getInt8(i))
    : size === 2 ? (sf === 0 ? (i) => raw.getUint16(2 * i, true) : (i) => raw.getInt16(2 * i, true))
    : size === 4 ? (sf === 2 ? (i) => raw.getFloat32(4 * i, true) : sf === 0 ? (i) => raw.getUint32(4 * i, true) : (i) => raw.getInt32(4 * i, true))
    : (i) => raw.getFloat64(8 * i, true);
  const dummy = sf === 2 || size === 8 ? null : sf === 0 ? 2 ** (8 * size) - 1 : -(2 ** (8 * size - 1)) + 1;
  // KX 1: NV rows of NE values (along X); -1: NV columns of NE values (along Y)
  const ncols = kx === 1 ? ne : nv, nrows = kx === 1 ? nv : ne;
  const values = new Float64Array(total);
  for (let v = 0; v < nv; v++) for (let e = 0; e < ne; e++) {
    const k = v * ne + e, s = read(k);
    const bad = dummy == null ? !(Number.isFinite(s) && s > -9.9e31) : s === dummy;
    const val = bad ? NaN : s / zmult + zbase;
    const row = kx === 1 ? v : e, col = kx === 1 ? e : v;
    values[row * ncols + col] = val;
  }
  return { ncols, nrows, x0, y0, dx: kx === 1 ? de : dvv, dy: kx === 1 ? dvv : de, rotation: rot, values, kind: "Geosoft", compressed, elementType: `${sf === 2 ? "float" : sf === 0 ? "uint" : "int"}${8 * size}` };
}

function surfer7(b, dv) {
  let p = 0, grid = null, values = null;
  while (p + 8 <= b.length) {
    const tag = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), len = dv.getInt32(p + 4, true);
    p += 8;
    if (tag === "GRID") {
      grid = { nrows: dv.getInt32(p, true), ncols: dv.getInt32(p + 4, true), x0: dv.getFloat64(p + 8, true), y0: dv.getFloat64(p + 16, true), dx: dv.getFloat64(p + 24, true), dy: dv.getFloat64(p + 32, true), rotation: dv.getFloat64(p + 56, true), blank: dv.getFloat64(p + 64, true) };
    } else if (tag === "DATA" && grid) {
      const n = grid.nrows * grid.ncols;
      values = new Float64Array(n);
      for (let i = 0; i < n; i++) { const v = dv.getFloat64(p + 8 * i, true); values[i] = v >= grid.blank * 0.999 || !Number.isFinite(v) ? NaN : v; }
      break;
    }
    if (tag === "DSRB") { p += len; continue; }
    p += len;
  }
  if (!grid || !values) throw new Error("This Surfer 7 grid has no GRID / DATA section.");
  return { ...grid, values, kind: "Surfer 7", compressed: false, elementType: "float64" };
}

function surfer6(dv) {
  const ncols = dv.getInt16(4, true), nrows = dv.getInt16(6, true);
  const xlo = dv.getFloat64(8, true), xhi = dv.getFloat64(16, true), ylo = dv.getFloat64(24, true), yhi = dv.getFloat64(32, true);
  const n = ncols * nrows, values = new Float64Array(n);
  for (let i = 0; i < n; i++) { const v = dv.getFloat32(56 + 4 * i, true); values[i] = v >= 1.7e38 || !Number.isFinite(v) ? NaN : v; }
  return { ncols, nrows, x0: xlo, y0: ylo, dx: (xhi - xlo) / Math.max(1, ncols - 1), dy: (yhi - ylo) / Math.max(1, nrows - 1), rotation: 0, values, kind: "Surfer 6", compressed: false, elementType: "float32" };
}

function surferAscii(b) {
  const tok = new TextDecoder().decode(b).split(/\s+/).filter(Boolean);
  const ncols = Number(tok[1]), nrows = Number(tok[2]), xlo = Number(tok[3]), xhi = Number(tok[4]), ylo = Number(tok[5]), yhi = Number(tok[6]);
  const n = ncols * nrows, values = new Float64Array(n);
  for (let i = 0; i < n; i++) { const v = Number(tok[9 + i]); values[i] = v >= 1.7e38 || !Number.isFinite(v) ? NaN : v; }
  return { ncols, nrows, x0: xlo, y0: ylo, dx: (xhi - xlo) / Math.max(1, ncols - 1), dy: (yhi - ylo) / Math.max(1, nrows - 1), rotation: 0, values, kind: "Surfer ASCII", compressed: false, elementType: "text" };
}
