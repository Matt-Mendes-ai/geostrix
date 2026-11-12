// TASKS.csv #2610 (review #2486; Matt's decision 2026-11-11) — a section snapshot or strip log placed on a Layout sheet is an SVG drawn as an
// image, and an image cannot use the app's bundled Exo 2: it fell back to Segoe UI (or whatever system-ui is on the computer) beside the
// sheet's Exo 2 title, legend and title block, and the exported SVG files did the same. The figure now carries the font it names: the
// bundled Exo 2 (latin, 400 and 600), SUBSET to the characters the figure uses, embedded as an @font-face data URI.
//
// The subset is a TrueType font (data:font/ttf) rather than woff2: woff2 needs a brotli encoder the renderer does not have without a new
// dependency, and the subset is small anyway (a few kB of glyphs). Kerning (GPOS) is not carried; the text is set unkerned.
// Pure apart from the lazily-imported table data (src/lib/fonts/exo2Tables.js, made by scripts/fonts/build-exo2-tables.mjs).

import { b64ToBytes, bytesToB64 } from "./base64.js"; // #1114 — the one base64 codec

// codepoint -> glyph id, from a (3,1) format 4 or (3,10) format 12 subtable
function readCmap(cmap) {
  const dv = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength), n = dv.getUint16(2), map = new Map();
  let best = null;
  for (let i = 0; i < n; i++) {
    const pid = dv.getUint16(4 + i * 8), eid = dv.getUint16(6 + i * 8), off = dv.getUint32(8 + i * 8), fmt = dv.getUint16(off);
    if (pid === 3 && eid === 10 && fmt === 12) { best = { off, fmt }; break; }
    if (pid === 3 && eid === 1 && fmt === 4 && !best) best = { off, fmt };
    if (pid === 0 && (fmt === 4 || fmt === 12) && !best) best = { off, fmt };
  }
  if (!best) return map;
  const o = best.off;
  if (best.fmt === 12) {
    const groups = dv.getUint32(o + 12);
    for (let g = 0; g < groups; g++) { const s = dv.getUint32(o + 16 + g * 12), e = dv.getUint32(o + 20 + g * 12), gid = dv.getUint32(o + 24 + g * 12); for (let c = s; c <= e; c++) map.set(c, gid + c - s); }
    return map;
  }
  const segX2 = dv.getUint16(o + 6), seg = segX2 / 2, ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  for (let s = 0; s < seg; s++) {
    const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(ranges + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let gid;
      if (ro === 0) gid = (c + delta) & 0xffff;
      else { const at = ranges + s * 2 + ro + (c - start) * 2; gid = dv.getUint16(at); if (gid) gid = (gid + delta) & 0xffff; }
      if (gid) map.set(c, gid);
    }
  }
  return map;
}

function checksum(u) { const n = Math.ceil(u.length / 4) * 4, p = new Uint8Array(n); p.set(u); const dv = new DataView(p.buffer); let s = 0; for (let i = 0; i < n; i += 4) s = (s + dv.getUint32(i)) >>> 0; return s; }

// a subset of one weight: tables { tag: Uint8Array } -> the TrueType font as Uint8Array, holding .notdef + the glyphs of `chars`
export function subsetTrueType(tables, chars) {
  const head = tables.head, hhea = tables.hhea, maxp = tables.maxp, loca = tables.loca, glyf = tables.glyf, hmtx = tables.hmtx;
  const hd = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const longLoca = hd.getInt16(50) === 1, ld = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const numGlyphs = new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);
  const at = (g) => (longLoca ? ld.getUint32(g * 4) : ld.getUint16(g * 2) * 2);
  const cmap = readCmap(tables.cmap);
  const gd = new DataView(glyf.buffer, glyf.byteOffset, glyf.byteLength);
  // glyph ids: .notdef, the characters', then every composite's components
  const keep = [0], seen = new Set([0]), codeGid = [];
  for (const c of [...new Set(chars)].map((ch) => ch.codePointAt(0)).sort((a, b) => a - b)) { const g = cmap.get(c); if (g && g < numGlyphs) { codeGid.push([c, g]); if (!seen.has(g)) { seen.add(g); keep.push(g); } } }
  const components = (g) => { const s = at(g), e = at(g + 1), out = []; if (e - s < 10 || gd.getInt16(s) >= 0) return out; let p = s + 10, more = true; while (more) { const fl = gd.getUint16(p); out.push({ pos: p + 2, gid: gd.getUint16(p + 2) }); p += 4 + (fl & 1 ? 4 : 2) + (fl & 8 ? 2 : fl & 0x40 ? 4 : fl & 0x80 ? 8 : 0); more = !!(fl & 0x20); } return out; };
  for (let i = 0; i < keep.length; i++) for (const c of components(keep[i])) if (!seen.has(c.gid) && c.gid < numGlyphs) { seen.add(c.gid); keep.push(c.gid); }
  const newId = new Map(keep.map((g, i) => [g, i]));
  // glyf + loca (long)
  const parts = [], offs = [0]; let total = 0;
  for (const g of keep) {
    const s = at(g), e = at(g + 1), bytes = new Uint8Array(glyf.subarray(s, e));
    const bd = new DataView(bytes.buffer);
    for (const c of components(g)) bd.setUint16(c.pos - s, newId.get(c.gid) ?? 0);
    const pad = (4 - (bytes.length % 4)) % 4, b = new Uint8Array(bytes.length + pad); b.set(bytes);
    parts.push(b); total += b.length; offs.push(total);
  }
  const nGlyf = new Uint8Array(total); { let p = 0; for (const b of parts) { nGlyf.set(b, p); p += b.length; } }
  const nLoca = new Uint8Array(offs.length * 4); { const v = new DataView(nLoca.buffer); offs.forEach((o, i) => v.setUint32(i * 4, o)); }
  // hmtx: a full metric per glyph
  const nH = new DataView(hhea.buffer, hhea.byteOffset).getUint16(34), md = new DataView(hmtx.buffer, hmtx.byteOffset, hmtx.byteLength);
  const nHmtx = new Uint8Array(keep.length * 4); { const v = new DataView(nHmtx.buffer); keep.forEach((g, i) => { const adv = md.getUint16((Math.min(g, nH - 1)) * 4), lsb = g < nH ? md.getInt16(g * 4 + 2) : md.getInt16(nH * 4 + (g - nH) * 2); v.setUint16(i * 4, adv); v.setInt16(i * 4 + 2, lsb); }); }
  const nHhea = new Uint8Array(hhea); new DataView(nHhea.buffer).setUint16(34, keep.length);
  const nMaxp = new Uint8Array(maxp); new DataView(nMaxp.buffer).setUint16(4, keep.length);
  const nHead = new Uint8Array(head); { const v = new DataView(nHead.buffer); v.setInt16(50, 1); v.setUint32(8, 0); }
  const nPost = new Uint8Array(32); new DataView(nPost.buffer).setUint32(0, 0x00030000);
  // cmap: one format 4 subtable (3,1), a segment per run of consecutive codes with consecutive new ids
  const bmp = codeGid.filter(([c]) => c < 0xffff).map(([c, g]) => [c, newId.get(g)]);
  const segs = [];
  for (const [c, g] of bmp) { const last = segs[segs.length - 1]; if (last && c === last.end + 1 && g - c === last.delta) last.end = c; else segs.push({ start: c, end: c, delta: g - c }); }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const sc = segs.length, len4 = 16 + sc * 8, nCmap = new Uint8Array(12 + len4);
  { const v = new DataView(nCmap.buffer); v.setUint16(2, 1); v.setUint16(4, 3); v.setUint16(6, 1); v.setUint32(8, 12);
    const o = 12; v.setUint16(o, 4); v.setUint16(o + 2, len4); v.setUint16(o + 6, sc * 2);
    let p2 = 1, e = 0; while (p2 * 2 <= sc) { p2 *= 2; e++; } v.setUint16(o + 8, p2 * 2); v.setUint16(o + 10, e); v.setUint16(o + 12, sc * 2 - p2 * 2);
    segs.forEach((s, i) => { v.setUint16(o + 14 + i * 2, s.end); v.setUint16(o + 16 + sc * 2 + i * 2, s.start); v.setUint16(o + 16 + sc * 4 + i * 2, s.delta & 0xffff); v.setUint16(o + 16 + sc * 6 + i * 2, 0); }); }
  const out = { "OS/2": tables["OS/2"], cmap: nCmap, glyf: nGlyf, head: nHead, hhea: nHhea, hmtx: nHmtx, loca: nLoca, maxp: nMaxp, name: tables.name, post: nPost };
  // the sfnt: tables in tag order, 4-byte aligned, with checksums and head's checkSumAdjustment
  const tags = Object.keys(out).sort(), n = tags.length;
  let size = 12 + n * 16; const placed = tags.map((t) => { const o = size; size += Math.ceil(out[t].length / 4) * 4; return o; });
  const font = new Uint8Array(size), fv = new DataView(font.buffer);
  fv.setUint32(0, 0x00010000); fv.setUint16(4, n); let p2 = 1, e = 0; while (p2 * 2 <= n) { p2 *= 2; e++; } fv.setUint16(6, p2 * 16); fv.setUint16(8, e); fv.setUint16(10, n * 16 - p2 * 16);
  tags.forEach((t, i) => { const r = 12 + i * 16; for (let k = 0; k < 4; k++) fv.setUint8(r + k, t.charCodeAt(k)); fv.setUint32(r + 4, checksum(out[t])); fv.setUint32(r + 8, placed[i]); fv.setUint32(r + 12, out[t].length); font.set(out[t], placed[i]); });
  const headAt = placed[tags.indexOf("head")];
  fv.setUint32(headAt + 8, (0xb1b0afba - checksum(font)) >>> 0);
  return font;
}

// the characters drawn by an SVG's text (content between tags, entities decoded)
export function svgTextChars(markup) {
  const set = new Set();
  const dec = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  for (const m of String(markup).matchAll(/>([^<]+)</g)) for (const ch of dec(m[1])) if (ch.trim()) set.add(ch);
  for (const ch of "0123456789 .,-") set.add(ch); // digits a label might gain on a re-render
  return [...set];
}

let tablesPromise = null;
const loadTables = () => (tablesPromise ||= import("./fonts/exo2Tables.js").then((m) => m.EXO2_TABLES));

// an SVG's markup -> the same markup with the subset Exo 2 embedded, when the figure names Exo 2 (a figure set in Arial or Calibri, picked
// in the section window, is left as it is). Bold or semibold text (font-weight 500 and up, or bold) gets the 600 face too.
export async function embedFigureFont(markup) {
  const s = String(markup || "");
  if (!s.includes("Exo 2") || s.includes("data:font/ttf")) return s;
  const open = s.match(/<svg\b[^>]*>/);
  if (!open) return s;
  const tables = await loadTables(), chars = svgTextChars(s);
  const decode = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, b64ToBytes(v)]));
  const face = (w, range) => `@font-face{font-family:'Exo 2';font-style:normal;font-weight:${range};src:url(data:font/ttf;base64,${bytesToB64(subsetTrueType(decode(tables[w]), chars))}) format('truetype');}`;
  const bold = /font-weight[=:]\s*["']?(?:[5-9]00|bold)/i.test(s);
  const css = face(400, "100 499") + (bold ? face(600, "500 900") : "");
  const i = open.index + open[0].length;
  return `${s.slice(0, i)}<defs><style>${css}</style></defs>${s.slice(i)}`;
}
