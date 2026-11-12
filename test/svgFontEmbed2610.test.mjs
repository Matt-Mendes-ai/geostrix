// TASKS.csv #2610 — the bundled Exo 2, subset to a figure's characters, embedded in the section / strip-log SVGs so a placed image keeps
// the sheet's typeface.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { subsetTrueType, svgTextChars, embedFigureFont } from "../src/lib/svgFontEmbed.js";
import { EXO2_TABLES } from "../src/lib/fonts/exo2Tables.js";

const dec = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, new Uint8Array(Buffer.from(v, "base64"))]));
const src = dec(EXO2_TABLES[400]);

// a minimal reader of the produced font
function readFont(u) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), n = dv.getUint16(4), t = {};
  for (let i = 0; i < n; i++) { const r = 12 + i * 16; const tag = String.fromCharCode(u[r], u[r + 1], u[r + 2], u[r + 3]); t[tag] = { sum: dv.getUint32(r + 4), off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) }; }
  return { dv, t, bytes: (tag) => u.subarray(t[tag].off, t[tag].off + t[tag].len) };
}
const sum = (u) => { const p = new Uint8Array(Math.ceil(u.length / 4) * 4); p.set(u); const v = new DataView(p.buffer); let s = 0; for (let i = 0; i < p.length; i += 4) s = (s + v.getUint32(i)) >>> 0; return s; };
// glyph id of a code in a format 4 subtable (the subsetter writes one)
function gidOf(cmap, code) {
  const v = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength), o = v.getUint32(8), segX2 = v.getUint16(o + 6), seg = segX2 / 2;
  for (let s = 0; s < seg; s++) { const end = v.getUint16(o + 14 + s * 2), start = v.getUint16(o + 16 + segX2 + s * 2), delta = v.getInt16(o + 16 + segX2 * 2 + s * 2); if (code >= start && code <= end) return (code + delta) & 0xffff; }
  return 0;
}
const glyphBytes = (glyf, loca, g) => { const lv = new DataView(loca.buffer, loca.byteOffset, loca.byteLength); return glyf.subarray(lv.getUint32(g * 4), lv.getUint32(g * 4 + 4)); };
const srcGlyph = (g) => { const head = new DataView(src.head.buffer); const long = head.getInt16(50) === 1, lv = new DataView(src.loca.buffer); const at = (i) => (long ? lv.getUint32(i * 4) : lv.getUint16(i * 2) * 2); return src.glyf.subarray(at(g), at(g + 1)); };

test("the subset is a well-formed TrueType font: table checksums, the whole-font checksum, glyph count, loca", () => {
  const f = subsetTrueType(src, [..."DH003 EOH"]);
  const { dv, t, bytes } = readFont(f);
  assert.equal(dv.getUint32(0), 0x00010000);
  for (const tag of ["OS/2", "cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "post"]) {
    assert.ok(t[tag], tag);
    const b = new Uint8Array(bytes(tag)); if (tag === "head") b.fill(0, 8, 12); // head's checksum is taken with checkSumAdjustment at 0
    assert.equal(t[tag].sum, sum(b), `${tag} checksum`);
  }
  assert.equal(sum(f), 0xb1b0afba, "head.checkSumAdjustment makes the font sum to the magic");
  const numGlyphs = new DataView(bytes("maxp").buffer, t.maxp.off).getUint16(4);
  assert.equal(numGlyphs, 1 + new Set("DH03 EO").size - 1 /* the space has a glyph too */ + 1);
  assert.equal(t.loca.len, (numGlyphs + 1) * 4);
  assert.equal(new DataView(bytes("head").buffer, t.head.off).getInt16(50), 1, "long loca");
  assert.ok(f.length < 6000, `${f.length} bytes`);
});

test("each character maps to a glyph with the original outline; a composite's components come along, renumbered", () => {
  const chars = [..."Aé"];
  const f = subsetTrueType(src, chars), { bytes } = readFont(f);
  const cmap = bytes("cmap"), glyf = bytes("glyf"), loca = bytes("loca");
  const gA = gidOf(cmap, 65);
  assert.ok(gA > 0);
  const a = glyphBytes(glyf, loca, gA);
  // 'A' is a simple glyph: identical bytes to one of the source glyphs (padding aside)
  let found = false;
  for (let g = 1; g < 300 && !found; g++) { const s = srcGlyph(g); if (s.length && s.length <= a.length && s.every((b, i) => b === a[i])) found = true; }
  assert.ok(found, "A's outline is copied");
  const ge = gidOf(cmap, 0xe9), e = glyphBytes(glyf, loca, ge), ev = new DataView(e.buffer, e.byteOffset, e.byteLength);
  if (ev.getInt16(0) < 0) { // composite: its component ids are inside the subset
    const n = new DataView(bytes("maxp").buffer, bytes("maxp").byteOffset).getUint16(4);
    let p = 10, more = true;
    while (more) { const fl = ev.getUint16(p), comp = ev.getUint16(p + 2); assert.ok(comp < n, `component ${comp} < ${n}`); p += 4 + (fl & 1 ? 4 : 2) + (fl & 8 ? 2 : fl & 0x40 ? 4 : fl & 0x80 ? 8 : 0); more = !!(fl & 0x20); }
  }
});

test("svgTextChars reads the drawn text, entities decoded", () => {
  const c = svgTextChars('<svg><text x="1">DH&amp;1 &#176;</text><title>Ø</title></svg>');
  for (const ch of ["D", "H", "&", "1", "°", "Ø"]) assert.ok(c.includes(ch), ch);
  assert.ok(!c.includes("="), "attribute text is not drawn text");
});

test("embedFigureFont: an @font-face after the <svg> tag when the figure names Exo 2; 600 only with bold text; once; Arial left alone", async () => {
  const plain = `<svg xmlns="http://www.w3.org/2000/svg" font-family="'Exo 2', 'Segoe UI', sans-serif"><text>DH003</text></svg>`;
  const out = await embedFigureFont(plain);
  assert.match(out, /^<svg [^>]*><defs><style>@font-face\{font-family:'Exo 2';font-style:normal;font-weight:100 499;src:url\(data:font\/ttf;base64,[A-Za-z0-9+/=]+\) format\('truetype'\);\}<\/style><\/defs><text>/);
  assert.equal((out.match(/@font-face/g) || []).length, 1);
  assert.equal(await embedFigureFont(out), out, "not embedded twice");
  const bold = await embedFigureFont(plain.replace("<text>", '<text font-weight="600">'));
  assert.equal((bold.match(/@font-face/g) || []).length, 2);
  const arial = plain.replace("'Exo 2', ", "");
  assert.equal(await embedFigureFont(arial), arial);
  assert.ok(out.length - plain.length < 12000, `${out.length - plain.length} bytes added`);
});

test("wiring: section snapshot / SVG / PNG, strip log snapshot / SVG / PNG and the atlas log embed the font", () => {
  const sw = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(sw, /const send = \(p\) => embedFigureFont\(markup\)\.catch\(\(\) => markup\)\.then\(\(m\) => sendSectionSnapshot\(\{ \.\.\.p, src:/);
  assert.equal((sw.match(/embedFigureFont\(/g) || []).length, 3);
  const sl = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.equal((sl.match(/embedFigureFont\(/g) || []).length, 3);
  assert.match(readFileSync(new URL("../src/lib/striplogSvg.js", import.meta.url), "utf8"), /const svg = await embedFigureFont\(built\.svg\)/);
});
