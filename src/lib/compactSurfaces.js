// TASKS.csv #483 — generated / imported surfaces in the project file. The #52 sync-out keeps every surface's
// world vertices (rounded to 1 cm) and triangle indices as plain number arrays, which the project file and
// every 60 s autosave wrote as JSON: ~34 MB for a 1M-triangle pit shell, and a JSON.stringify of all of it
// each time. A large surface is now written as
//   compactMesh: { n, ni, dv: <base64>, di: <base64> }
// dv: each vertex coordinate in whole CENTIMETRES minus the same coordinate of the previous vertex; di: each
// index minus the previous one. Both as zigzag varints (1 byte for -64..63, 2 for up to ±8191, ...): a mesh's
// neighbouring vertices and consecutive indices are close, so most values take 1-2 bytes. Centimetres
// because the vertices are already on a 1 cm grid, so integers reproduce them EXACTLY at any extent (Float32
// offsets would start losing centimetres beyond ~80 km). Small surfaces (below COMPACT_MIN_VERTICES) stay
// readable JSON. What the app holds in memory is unchanged: load expands back to plain number arrays.
// The encoded form is cached per vertices/indices array (the sync-out reuses those arrays across metadata
// edits), so the repeated snapshot / dirty-check / autosave calls re-encode nothing.

export const COMPACT_MIN_VERTICES = 2000;

function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : globalThis.Buffer.from(s, "binary").toString("base64");
}
function b64ToBytes(b64) {
  const s = typeof atob === "function" ? atob(b64) : globalThis.Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// zigzag varints of successive differences (plain arithmetic, not bit ops: values can pass 2^31)
function packDeltas(values, count, get) {
  let buf = new Uint8Array(count * 2 + 16), o = 0, prev = 0;
  for (let i = 0; i < count; i++) {
    const v = get(values, i);
    const d = v - prev; prev = v;
    let z = d >= 0 ? d * 2 : -d * 2 - 1;
    if (o + 10 > buf.length) { const b = new Uint8Array(buf.length * 2); b.set(buf); buf = b; }
    while (z >= 128) { buf[o++] = (z % 128) + 128; z = Math.floor(z / 128); }
    buf[o++] = z;
  }
  return bytesToB64(buf.subarray(0, o));
}
function unpackDeltas(b64, count) {
  const bytes = b64ToBytes(b64), out = new Array(count);
  let o = 0, prev = 0;
  for (let i = 0; i < count; i++) {
    let z = 0, mul = 1, b;
    do { b = bytes[o++]; z += (b % 128) * mul; mul *= 128; } while (b >= 128);
    prev += z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    out[i] = prev;
  }
  return out;
}

const cache = new WeakMap(); // vertices array -> { indices, compactMesh }

function encode(verts, idx) {
  const n = verts.length / 3;
  const cmAt = (v, i) => Math.round(v[i] * 100);
  for (let i = 0; i < verts.length; i++) if (!Number.isFinite(verts[i]) || Math.abs(verts[i]) > 1e12) return null; // keep it as JSON
  for (let i = 0; i < idx.length; i++) if (!Number.isInteger(idx[i]) || idx[i] < 0) return null;
  // vertices component-major (all x, then all y, then all z) so each delta is against the same coordinate
  const dv = packDeltas(verts, verts.length, (v, k) => cmAt(v, (k % n) * 3 + Math.floor(k / n)));
  return { n, ni: idx.length, dv, di: packDeltas(idx, idx.length, (a, k) => a[k]) };
}

export function compactSurfaces(list) {
  return (list || []).map((s) => {
    const v = s.vertices, ix = s.indices;
    if (!Array.isArray(v) && !ArrayBuffer.isView(v)) return s;
    if (v.length / 3 < COMPACT_MIN_VERTICES || !ix?.length) return s;
    let c = cache.get(v);
    if (!c || c.indices !== ix) {
      c = { indices: ix, compactMesh: encode(v, ix) };
      cache.set(v, c);
    }
    if (!c.compactMesh) return s;
    const { vertices: _v, indices: _i, ...rest } = s;
    return { ...rest, compactMesh: c.compactMesh };
  });
}

export function expandSurfaces(list) {
  return (list || []).map((s) => {
    if (!s?.compactMesh) return s;
    const { compactMesh: m, ...rest } = s;
    const n = m.n, flat = unpackDeltas(m.dv, n * 3); // component-major centimetres
    const vertices = new Array(n * 3);
    for (let k = 0; k < n * 3; k++) vertices[(k % n) * 3 + Math.floor(k / n)] = flat[k] / 100;
    const indices = unpackDeltas(m.di, m.ni);
    cache.set(vertices, { indices, compactMesh: m }); // saving it again unchanged re-encodes nothing
    return { ...rest, vertices, indices };
  });
}
