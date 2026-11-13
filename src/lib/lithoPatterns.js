// TASKS.csv #1995 — FGDC lithology patterns (FGDC-STD-013-2006, series 600 and 700; public domain, repackaged CC0 by
// davenquinn/geologic-patterns) over the lithology colours of a strip log, so a printed log reads like every other one, and in black
// and white. The 29 patterns used ship as SVG tiles in public/patterns/fgdc and are fetched only when a log draws them.
//
// Which pattern a logged code gets, first match wins:
//   1. a pattern the user chose for the code (legendOverride.litho[code].pattern; "" = none),
//   2. the code itself against common abbreviations (LMST, SST, DACT, BSL ...),
//   3. the code's display name (UNIT_NAMES or the legend's label, e.g. "Meta-siltstone"),
//   4. the code's most frequent logged description ("mg qtz monz wt perv hem alt" -> a granitoid), by keywords.
// Codes that mean overburden, casing, a fault zone or no recovery get none: a pattern would claim a rock that is not there.
// Unmatched codes keep their plain colour. The assignments are GeoStrix's convention over the FGDC chart, not a standard of
// their own; the window shows each code's pattern and lets it be changed.

import { labLightness } from "./colorRamp.js";

export const FGDC_PATTERNS = {
  601: "Gravel or conglomerate", 605: "Breccia", 607: "Sand or sandstone", 616: "Silt or siltstone", 620: "Clay, shale or mudstone",
  624: "Carbonaceous shale", 627: "Limestone", 642: "Dolostone", 649: "Bedded chert", 654: "Subgraywacke", 658: "Coal",
  667: "Gypsum", 668: "Salt", 681: "Till or diamicton", 702: "Quartzite", 703: "Slate", 705: "Schist", 708: "Gneiss",
  710: "Soapstone, talc or serpentinite", 711: "Tuffaceous rock", 715: "Volcanic breccia or agglomerate", 717: "Basaltic flows",
  719: "Granite", 720: "Banded igneous rock", 721: "Igneous rock", 723: "Igneous rock (ultramafic)", 729: "Porphyritic rock",
  732: "Quartz", 733: "Ore",
};

// no pattern: not a rock, or not one rock
const NONE = /^(ob|obn|ovb|ovbd|overburden|cas|casing|nr|nrcv|norec|no recovery|flt|fault|fz|void|lost|cavity|gouge|ut|utg)$/i;
const NONE_TEXT = /\b(overburden|casing|no recovery|lost core|void|fault zone|fault gouge)\b/i;
// 2. abbreviations, the whole code
const CODES = [
  [733, ["ms", "msulf", "msul", "sms", "msx", "ore"]], [732, ["qv", "qtzv", "qzv", "vein", "qtz"]],
  [627, ["lst", "lmst", "ls", "lime", "marb"]], [642, ["dol", "dlst", "dolo", "dolst"]], [607, ["sst", "ss", "sndst", "sdst", "sand"]],
  [616, ["slst", "silt", "slt", "sltst"]], [620, ["sh", "shale", "mdst", "arg", "argl", "clst", "mud"]], [601, ["cgl", "cong", "congl"]],
  [605, ["bx", "brx", "brec", "silbx"]], [649, ["cht", "chert"]], [658, ["coal"]], [681, ["till", "dmct"]], [702, ["qtzt", "qzt"]],
  [703, ["sl", "slate", "phyl"]], [705, ["sch", "schist"]], [708, ["gn", "gns", "gneiss"]], [711, ["tf", "tuff", "vcl", "vclst"]],
  [717, ["bas", "bsl", "bslt", "basalt", "and", "ands", "ande", "andes"]], [720, ["dac", "dact", "rhy", "rhyo", "rhyl"]],
  [719, ["gr", "grt", "gran", "gdio", "grd", "monz", "qmz", "fint", "syen", "ton"]], [721, ["gab", "gbr", "dio", "dior", "diab", "mint", "dyk", "dyke"]],
  [729, ["porph", "qfp", "fp", "pph"]], [723, ["um", "pdt", "per", "dun"]], [710, ["serp", "talc"]],
];
const CODE_MAP = new Map(CODES.flatMap(([p, cs]) => cs.map((c) => [c, p])));
// 3-4. keywords in a name or a description, most specific first
const RULES = [
  [733, /massive sul(ph|f)ide|semi-?massive|\bmsulf/i],
  [732, /quartz vein|qtz vein|vein quartz|white (massive )?quartz/i],
  [715, /(volcanic|andesit\w*|and\.|basalt\w*|dacit\w*|rhyolit\w*|polymictic\s+and\.?)\s*breccia|agglomerate|hyaloclast/i],
  [711, /tuff|lapilli|volcaniclastic|volc\w*\.?\s*clast|\bv-clast|pyroclastic|epiclastic/i], // "Fg And V-clast", "Andesitic Volc Clast" (Woodjam)
  [729, /porphyr|\bporph\b|phyric|\bqfp\b/i],
  [710, /serpentin|\btalc\b|soapstone/i],
  [723, /peridotite|dunite|pyroxenite|ultramafic|komatiite/i],
  [719, /granit|granodiorit|\bgdio\b|monzonit|\bmonz\b|syenit|tonalit|aplit|apilit|pegmatit|felsic intrusive/i],
  [721, /gabbro|\bgab\b|diorit|diabase|dolerite|norite|mafic intrusive|\bdyke?\b/i],
  [717, /basalt|andesit|\band\.|mafic volcanic|mafic flow|pillow/i],
  [720, /rhyolit|dacit|felsic volcanic|obsidian/i],
  [708, /gneiss|migmatit/i], [705, /schist/i], [703, /phyllit|\bslate\b/i], [702, /quartzite/i],
  [605, /breccia|\bbx\b/i],
  [601, /conglomerat|\bgravel\b|\bcgl\b/i],
  [654, /gr[ae]ywacke|\bwacke\b/i],
  [624, /graphitic|carbonaceous|black shale/i],
  [616, /siltstone|\bslst\b|\bsilt\b/i],
  [607, /sandstone|\bsst\b|\bsand\b|arenite|arkose/i],
  [620, /shale|mudstone|claystone|argillite|\bclay\b|pelite/i],
  [642, /dolostone|dolomite/i],
  [627, /limestone|\blst\b|calcarenite|\bmarble\b/i],
  [649, /chert/i], [658, /\bcoal\b|lignite/i], [667, /gypsum|anhydrite/i], [668, /halite|\bsalt\b/i], [681, /\btill\b|diamict/i],
];
const byText = (text) => { const s = String(text || ""); if (!s.trim() || NONE_TEXT.test(s)) return null; const r = RULES.find(([, re]) => re.test(s)); return r ? r[0] : null; };

// -> FGDC code (number) or null. name / description: the unit's display name and its most frequent logged description
export function patternForUnit(code, name = "", description = "") {
  const c = String(code ?? "").trim();
  if (!c || NONE.test(c)) return null;
  const k = c.toLowerCase();
  if (CODE_MAP.has(k)) return CODE_MAP.get(k);
  const n = String(name || "").replace(new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—-]\\s*`), ""); // "S5 — Meta-siltstone" -> "Meta-siltstone"
  if (NONE_TEXT.test(n)) return null;
  return byText(n) ?? byText(description);
}

// TASKS.csv #2215 (review #2174, WA gold) — a code's description is what it means only when it is logged on most of its intervals: the WA
// export's GeolComments are notes on a few rows ('GRAVEL IS QTZ VN MATERIAL' on 1 of 6 TGVL, 3 of 121 SCP rows with any), and one note
// printed a pattern as if the rock had been logged as it (SCP -> Quartz, ISY -> Igneous rock). -> Map code -> its most frequent
// description, kept when at least half of the code's intervals carry a description and that one is the most frequent
export function codeDescriptions(rows) {
  const desc = new Map(), total = new Map();
  for (const r of rows || []) {
    total.set(r?.value, (total.get(r?.value) || 0) + 1);
    if (!r?.description) continue;
    const m = desc.get(r.value) || new Map();
    m.set(r.description, (m.get(r.description) || 0) + 1);
    desc.set(r.value, m);
  }
  const out = new Map();
  for (const [v, m] of desc) {
    let n = 0; for (const c of m.values()) n += c;
    if (2 * n < (total.get(v) || 0)) continue; // a comment on a few rows, not the code's meaning
    out.set(v, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return out;
}

// rows (litho intervals: { value, description? }), nameOf(code), override ({ code: { pattern } }) -> { code: FGDC code | null }
export function lithoPatternMap(rows, nameOf = (v) => v, override = null) {
  const desc = codeDescriptions(rows); // #2215
  const out = {};
  for (const v of new Set((rows || []).map((r) => r.value))) {
    const o = override?.[v]?.pattern;
    if (o !== undefined && o !== null) { out[v] = o === "" ? null : Number(o); continue; }
    out[v] = patternForUnit(v, nameOf(v), desc.get(v) || "");
  }
  return out;
}

// The tiles' inner shapes, defensively reduced to plain shapes (the shipped files are vetted; this keeps it so if one is replaced).
const SHAPES = /^(g|line|path|polyline|polygon|circle|rect|ellipse)$/i;
export function sanitizeTile(svgText) {
  const vb = String(svgText).match(/viewBox="([-\d.\s]+)"/);
  const body = String(svgText).replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
    .replace(/<(script|style|foreignObject)\b[\s\S]*?<\/\1\s*>/gi, ""); // their content too, not only the tags
  const clean = body.replace(/<\/?([a-zA-Z]+)([^>]*)>/g, (m, tag, attrs) => {
    if (!SHAPES.test(tag)) return "";
    if (m.startsWith("</")) return `</${tag}>`;
    const keep = [...attrs.matchAll(/\s([a-zA-Z0-9:-]+)="([^"]*)"/g)].filter(([, a, v]) => /^(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|d|points|style|transform)$/.test(a) && !/url\(|javascript:|expression/i.test(v));
    return `<${tag}${keep.map(([, a, v]) => ` ${a}="${v}"`).join("")}${m.endsWith("/>") ? "/>" : ">"}`;
  }).replace(/>[^<]+</g, "><"); // no loose text between shapes
  return vb ? { viewBox: vb[1].trim().split(/\s+/).map(Number), inner: clean } : null;
}

const cache = new Map(); // code -> Promise<tile | null>
// codes -> { code: { viewBox, inner } } for the ones that load; fetcher is injectable for tests
export async function loadPatternTiles(codes, fetcher = (url) => fetch(url).then((r) => (r.ok ? r.text() : null))) {
  const out = {};
  await Promise.all([...new Set(codes.filter((c) => c != null))].map(async (c) => {
    if (!cache.has(c)) cache.set(c, fetcher(`patterns/fgdc/${c}.svg`).then((t) => (t ? sanitizeTile(t) : null)).catch(() => null));
    const t = await cache.get(c);
    if (t) out[c] = t;
  }));
  return out;
}

// <pattern> definitions, a tile drawn `size` px across; id "fgdc-<code>" (black lines) and "fgdc-<code>-w" (white lines, for dark colours:
// black limestone lines vanished on Silvertip's dark blue LMST)
// The tiles (~54 units) are drawn for print with 0.3-0.8 unit strokes: at 24 px a tile's lines were 0.13-0.35 px, hairlines a
// screen hardly shows. A tile is drawn 40 px across with its strokes doubled (0.44-1.2 px; twice that in a 2x PNG).
export const PATTERN_TILE_PX = 40;
export const PATTERN_STROKE_SCALE = 2;
// size: the tile's width in px; a smaller tile keeps the 40 px tile's line widths (strokes scaled up by 40 / size), so a section's or a
// legend swatch's lines stay visible. prefix: the ids' prefix, for an SVG that holds two tile sizes.
export function patternDefs(tiles, size = PATTERN_TILE_PX, prefix = "fgdc") {
  const k = PATTERN_STROKE_SCALE * Math.max(1, PATTERN_TILE_PX / size);
  return Object.entries(tiles).map(([c, t]) => {
    const [, , w, h] = t.viewBox, ph = (size * h) / w;
    const head = (id) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${+size.toFixed(3)}" height="${+ph.toFixed(3)}" viewBox="${t.viewBox.join(" ")}">`;
    const inner = t.inner.replace(/stroke-width:([\d.]+)/g, (m, v) => `stroke-width:${+(Number(v) * k).toFixed(3)}`);
    return `${head(`${prefix}-${c}`)}${inner}</pattern>${head(`${prefix}-${c}-w`)}${inner.replace(/#000000\b|#000\b/g, "#ffffff")}</pattern>`;
  }).join("");
}
// the fill for a pattern over a background colour: white lines when the colour is dark (CIELAB L* under 45)
export function patternFill(code, bg, prefix = "fgdc") {
  const L = typeof bg === "string" && /^#[0-9a-f]{6}$/i.test(bg) ? labLightness(bg) : null;
  return `url(#${prefix}-${code}${L != null && L < 45 ? "-w" : ""})`;
}
// a legend swatch as an SVG data URL: the colour with a size-px window of the strip log's 40 px tile over it (Layout's HTML legend).
// A whole tile squeezed into 14 px merged its dots and dashes into a near-black square.
export function patternSwatchUrl(tile, code, bg, size = 16) {
  if (!tile) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${patternDefs({ [code]: tile }, PATTERN_TILE_PX, "s")}</defs>`
    + `<rect width="${size}" height="${size}" fill="${bg || "#ffffff"}"/><rect width="${size}" height="${size}" fill="${patternFill(code, bg, "s")}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
// a section's tile: about three hole widths across (a 12 px ribbon, 36 px tiles), 12 to 40 px
export const sectionTilePx = (holeWidth) => Math.max(12, Math.min(PATTERN_TILE_PX, 3 * (Number(holeWidth) || 5)));

// TASKS.csv #1995 — a section's payload with each lithology interval's pattern (pat) and its legend rows' (a 4th element: the 3rd holds
// the grouped legend's options, which groupSectionLegend fills from it). byCode: lithoPatternMap's result. The section window draws
// them only when its Patterns box is ticked.
export function withSectionPatterns(payload, byCode) {
  if (!payload?.intervals || !byCode) return payload;
  const byKey = new Map();
  const intervals = payload.intervals.map((r) => {
    const pat = r.layer === "litho" && r.code != null ? byCode[r.code] : null;
    if (pat == null) return r;
    byKey.set(`${r.label}|${r.color}`, pat);
    return { ...r, pat };
  });
  if (!byKey.size) return payload;
  const legendItems = payload.legendItems?.map((it) => { const p = byKey.get(`${it[0]}|${it[1]}`); return p != null ? [it[0], it[1], it[2] ?? null, p] : it; });
  return { ...payload, intervals, ...(legendItems ? { legendItems } : {}) };
}
