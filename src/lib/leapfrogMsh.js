// TASKS.csv #1991 — Leapfrog mesh (.msh) import, written from the format's public description (clean room: the LGPL
// leapfrogmshreader / GemGIS code was not read). A Leapfrog .msh is a short text header, then binary data:
//   %% Leapfrog mesh file …           (free text lines)
//   [index]
//   Tri Integer 3 2000;               (name, type, values per item, item count; the ';' is optional)
//   Location Double 3 1002;
//   [binary]
//   <the blocks, in [index] order, little-endian: int32 triangle corner indices, float64 x y z vertices>
// Other blocks the index may list (normals, values) are skipped by their size. The few bytes some writers put between
// the '[binary]' line and the first block are found, not assumed: the start that makes every triangle index land on a
// vertex and every vertex finite is the one used. A UBC-GIF tensor mesh (also .msh, plain text: 'NX NY NZ' first) is
// recognized and refused with where to load it instead.

import { t as tr } from "./i18n.js"; // TASKS.csv #786

const TYPE_BYTES = { integer: 4, int: 4, int32: 4, float: 4, single: 4, float32: 4, double: 8, float64: 8 };

const asBytes = (data) => (data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

function findAscii(bytes, word, from = 0, to = bytes.length) {
  const w = Array.from(word, (c) => c.charCodeAt(0));
  outer: for (let i = from; i <= to - w.length; i++) {
    for (let k = 0; k < w.length; k++) if (bytes[i + k] !== w[k]) continue outer;
    return i;
  }
  return -1;
}

const asciiText = (bytes, a, b) => { let s = ""; for (let i = a; i < b; i++) s += String.fromCharCode(bytes[i]); return s; };

// true for the plain-text UBC-GIF tensor mesh ('NX NY NZ' then the corner, then cell widths)
export function looksLikeUbcMesh(data) {
  const b = asBytes(data);
  const head = asciiText(b, 0, Math.min(b.length, 400));
  if (/\[binary\]|\[index\]/i.test(head)) return false;
  const lines = head.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines.length >= 2 && /^\d+\s+\d+\s+\d+$/.test(lines[0]) && /^[-+\d.eE]+(\s+[-+\d.eE]+){2}$/.test(lines[1]);
}

// the [index] lines -> [{ name, type, bytes, width, count }]
export function parseMshIndex(text) {
  const out = [];
  const m = /\[index\]([\s\S]*?)(\[binary\]|$)/i.exec(text);
  if (!m) return out;
  for (const raw of m[1].split(/\r?\n/)) {
    const t = raw.replace(/;\s*$/, "").trim();
    if (!t || t.startsWith("%") || t.startsWith("#")) continue;
    const p = t.split(/\s+/);
    if (p.length < 4) continue;
    const bytes = TYPE_BYTES[p[1].toLowerCase()];
    const width = Number(p[2]), count = Number(p[3]);
    if (!bytes || !Number.isInteger(width) || !Number.isInteger(count) || width < 1 || count < 0) continue;
    out.push({ name: p[0], type: p[1].toLowerCase(), bytes, width, count });
  }
  return out;
}

// bytes -> { parts: [{ layer, positions: Float64Array, indices: Uint32Array }], triangleCount, vertexCount, oneBased, skipped }
export function parseLeapfrogMsh(data, { name = "mesh" } = {}) {
  const b = asBytes(data);
  if (looksLikeUbcMesh(b)) throw new Error(tr("This .msh is a UBC-GIF tensor mesh (cell widths for an inversion model), not a Leapfrog surface: load it with its model file in Geophysics > Block models."));
  const at = findAscii(b, "[binary]", 0, Math.min(b.length, 1 << 20));
  if (at < 0) throw new Error(tr("No [binary] section: not a Leapfrog mesh file."));
  const blocks = parseMshIndex(asciiText(b, 0, at + 8));
  const tri = blocks.find((k) => /^tri/i.test(k.name) && k.width === 3 && k.bytes === 4);
  const loc = blocks.find((k) => /^(location|vertex|vertices|point|points)/i.test(k.name) && k.width === 3);
  if (!tri || !loc) throw new Error(tr("The [index] does not list both triangles ('Tri Integer 3 n') and vertices ('Location Double 3 n')."));
  const total = blocks.reduce((s, k) => s + k.bytes * k.width * k.count, 0);
  let body = at + 8;
  const after = body;
  if (b[body] === 0x0d) body++;
  if (b[body] === 0x0a) body++;
  const nTri = tri.count, nV = loc.count;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const offsetOf = (blk) => { let o = 0; for (const k of blocks) { if (k === blk) return o; o += k.bytes * k.width * k.count; } return o; };
  const triOff = offsetOf(tri), locOff = offsetOf(loc);
  // the blocks fill the end of the file in most writers; else try the first bytes after the line
  const starts = [b.length - total];
  for (let s = after; s <= after + 64; s++) if (!starts.includes(s)) starts.push(s);
  const readV = (s, i) => (loc.bytes === 8 ? view.getFloat64(s + locOff + i * 8, true) : view.getFloat32(s + locOff + i * 4, true));
  let start = -1, oneBased = false;
  for (const s of starts) {
    if (s < after || s + total > b.length) continue;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < nTri * 3; i++) { const v = view.getInt32(s + triOff + i * 4, true); if (v < mn) mn = v; if (v > mx) mx = v; }
    const zero = mn >= 0 && mx < nV, one = mn >= 1 && mx <= nV && mx === nV;
    if (!(zero || one) && nTri) continue;
    let finite = true;
    for (let i = 0; i < nV * 3; i += Math.max(1, Math.floor(nV / 500)) * 3) { const v = readV(s, i); if (!Number.isFinite(v) || Math.abs(v) > 1e9) { finite = false; break; } }
    if (!finite) continue;
    start = s; oneBased = !zero && one;
    break;
  }
  if (start < 0) throw new Error(tr("The binary data does not match the [index]: the triangles do not point at the vertices."));
  const positions = new Float64Array(nV * 3);
  for (let i = 0; i < nV * 3; i++) positions[i] = readV(start, i);
  const indices = new Uint32Array(nTri * 3);
  for (let i = 0; i < nTri * 3; i++) indices[i] = view.getInt32(start + triOff + i * 4, true) - (oneBased ? 1 : 0);
  const skipped = blocks.filter((k) => k !== tri && k !== loc).map((k) => k.name);
  return { parts: [{ layer: name, positions, indices }], triangleCount: nTri, vertexCount: nV, oneBased, skipped };
}

// a mesh -> .msh bytes (tests, and the round trip a writer would need)
export function writeLeapfrogMsh(positions, indices, { gap = 0 } = {}) {
  const nV = positions.length / 3, nT = indices.length / 3;
  const head = `%% Leapfrog mesh file\r\n[index]\r\nTri Integer 3 ${nT};\r\nLocation Double 3 ${nV};\r\n[binary]\r\n`;
  const out = new Uint8Array(head.length + gap + nT * 12 + nV * 24);
  for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i);
  const v = new DataView(out.buffer);
  let o = head.length + gap;
  for (let i = 0; i < nT * 3; i++, o += 4) v.setInt32(o, indices[i], true);
  for (let i = 0; i < nV * 3; i++, o += 8) v.setFloat64(o, positions[i], true);
  return out;
}
