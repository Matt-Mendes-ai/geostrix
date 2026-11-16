// ============================================================
// Layer metadata, colors, and generic CSV import mapping helpers
// ============================================================
import { rowKey } from "./modellingCodes.js"; // TASKS.csv #2533 — the vein sources read the modelling codes' assign map
import { voxelStretch } from "./voxelStretch.js"; // TASKS.csv #1812
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

// Bug found during the UBC-mesh-coarsening perf fix (real repro: a 432,000-value array crashed with
// "Maximum call stack size exceeded"): `Math.min(...arr)`/`Math.max(...arr)` spreads the WHOLE array
// as individual call arguments, which blows the JS engine's argument-count limit (V8's ceiling sits
// somewhere in the ~65k-125k range depending on build/stack depth) well under sizes this app's own
// data actually reaches — a large assay/geophysics dataset, a big DEM grid, or a many-hole project's
// desurveyed trace points can all get there. A plain reduce loop has no such limit. Shared here since
// the same min/max-over-a-big-array pattern shows up across several modules.
export function minMax(arr, mapFn) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = mapFn ? mapFn(arr[i]) : arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}

// TASKS.csv #249 (colorblind-safety review) — restricted to a 220°-wide hue arc (160°→380°, wrapping
// through 0°) that excludes the ~20°-160° red-green confusion band, biasing collisions away from the
// worst case for deuteranopia/protanopia instead of the previous full 0-360° range. This is a
// second-line mitigation only — an unbounded set of possible input codes still can't guarantee real
// separation from a hash alone, hash or not; see categoricalSafeColor below for the actual first-line
// fix (a curated palette assigned by first-seen order, used before this function is ever reached).
function hashColor(key, sat = 55, light = 52) {
  let hash = 0;
  const k = (key === undefined || key === null || key === "" ? "unknown" : String(key)).toLowerCase();
  for (let i = 0; i < k.length; i++) hash = k.charCodeAt(i) + ((hash << 5) - hash);
  const hue = (160 + (Math.abs(hash) % 220)) % 360;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// TASKS.csv #249 (colorblind-safety review) — first line of defense for any code not in this file's
// hand-picked tables (LITHO_COLORS/ALT_COLORS/etc): a curated, widely-cited colorblind-safe qualitative
// set (Okabe-Ito's 7 + Paul Tol's "muted" 9, overlap-checked by eye) assigned by FIRST-SEEN ORDER per
// distinct code within one namespace (litho/alt/vein/mineral/structure/medium kept separate so e.g. a
// litho code and an alteration code sharing a string don't fight over the same slot) — guaranteeing
// real perceptual separation for the first 16 distinct codes a project actually uses, which is every
// real single-project dataset seen in this app so far. Falls back to hashColor (hash-to-restricted-hue)
// only past that, since a literal unbounded set of possible site-specific codes has no way to reserve
// slots for in advance.
// TASKS.csv #306 — now also consumed by ViewerModule's ASSAY_ELEMENT_COLORS (see that constant's own
// comment for the measured deuteranopia collisions in the hand-picked palette it replaced), hence the
// export. Nothing else about it changed; the ordering below is still #249's.
export const CATEGORICAL_SAFE_COLORS = [
  "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7",
  "#332288", "#117733", "#44AA99", "#88CCEE", "#DDCC77", "#CC6677", "#AA4499", "#882255", "#999933",
];
// TASKS.csv #1377 (review #1352, Silvertip) — every new lithology group was #8a7fbf, so two groups looked the same in the stack
// list and the legend: the first palette colour no existing group uses (then a hash of the name)
export function nextGroupColour(groups, name = "") {
  const used = new Set((groups || []).map((g) => String(g?.color || "").toLowerCase()));
  return CATEGORICAL_SAFE_COLORS.find((c) => !used.has(c.toLowerCase())) || hashColor(String(name || "group").toLowerCase());
}
// TASKS.csv #1549 (review #1497, Lawyers) — the fault picker's 'Named as faults' group used /flt|fault|shear|shz/, so Lawyers' fault
// zones fz-gc, fz-gr, fz-bx, fz-br and fz-sl fell under 'Other structure types'. The fault vocabulary of the lithology roles, as
// whole tokens of a structure type or id ('fz-gc', 'SH', 'Fault zone'), plus fault / shear inside a word ('Shearzone').
const FAULT_TOKENS = new Set(["fz", "flt", "fltz", "fault", "faults", "shear", "shz", "sh", "gouge", "gge"]);
export function faultLikeName(text) {
  const t = String(text || "").toLowerCase();
  return /fault|shear/.test(t) || t.split(/[^a-z0-9]+/).some((w) => FAULT_TOKENS.has(w));
}
const categoricalColorCache = new Map(); // namespace -> Map(code -> color), persists for the app session
function categoricalSafeColor(namespace, key) {
  let cache = categoricalColorCache.get(namespace);
  if (!cache) { cache = new Map(); categoricalColorCache.set(namespace, cache); }
  const k = key === undefined || key === null || key === "" ? "unknown" : String(key).toLowerCase();
  if (cache.has(k)) return cache.get(k);
  const color = cache.size < CATEGORICAL_SAFE_COLORS.length ? CATEGORICAL_SAFE_COLORS[cache.size] : beyondPalette(cache, k);
  cache.set(k, color);
  return color;
}
// TASKS.csv #2524 / #2940 (reviews #2486, #2876) — past the 16 palette colours the hashed hues ran together: GR #41c8ab and NS #41c8a6, SC and
// CAV identical, six violets and seven magentas on an iron strand log; DID_U / DID_M / DID_L had nothing in common with DID. A code past the
// palette now takes the next slot of a golden-angle hue sequence with a three-step lightness cycle (neighbouring slots differ in hue by about
// 137 degrees and in lightness), and a sub-divided code (its parent before '_', '-' or a space) whose parent already has a colour takes a
// lighter or darker shade of that parent's hue. Deterministic in first-seen order, as the palette is.
const GOLDEN = 137.508, LIGHT_CYCLE = [50, 66, 36];
export function beyondPalette(cache, k) {
  const parent = k.split(/[_\-\s]+/)[0];
  if (parent && parent !== k && cache.has(parent)) {
    const hsl = hexOrHslToHsl(cache.get(parent));
    if (hsl) {
      // the lightness of the parent and of the siblings already shaded: the first step that keeps 6 points from all of them (clamped to 18-86)
      const used = [hsl.l];
      for (const [key, c] of cache) if (key !== parent && key.split(/[_\-\s]+/)[0] === parent) { const o = hexOrHslToHsl(c); if (o) used.push(o.l); }
      const clamp = (v) => Math.max(18, Math.min(86, Math.round(v)));
      const steps = [18, -16, 30, -28, 9, -8, 40, -38, 24, -22];
      const l = steps.map((d) => clamp(hsl.l + d)).find((v) => used.every((u) => Math.abs(u - v) >= 6));
      if (l != null) return `hsl(${Math.round(hsl.h)}, ${Math.round(Math.max(30, hsl.s))}%, ${l}%)`;
    }
  }
  const n = cache.size - CATEGORICAL_SAFE_COLORS.length;
  const hue = (25 + n * GOLDEN) % 360;
  return `hsl(${Math.round(hue)}, 58%, ${LIGHT_CYCLE[n % LIGHT_CYCLE.length]}%)`;
}
// "#rrggbb" or "hsl(h, s%, l%)" -> { h, s, l } (degrees, per cent) or null
function hexOrHslToHsl(c) {
  const m = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(String(c || "").trim());
  if (m) return { h: +m[1], s: +m[2], l: +m[3] };
  const x = /^#?([0-9a-f]{6})$/i.exec(String(c || "").trim());
  if (!x) return null;
  const r = parseInt(x[1].slice(0, 2), 16) / 255, g = parseInt(x[1].slice(2, 4), 16) / 255, bl = parseInt(x[1].slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

// TASKS.csv #249 (colorblind-safety review) — this palette skewed heavily brown/olive/dark-green,
// exactly the hue family that collapses under deuteranopia/protanopia. Three pairs nudged apart:
// m1 pushed toward a more distinctly warm brown (was olive-green, too close to v5); s6 pushed toward
// blue (was pale sage-green, too close to m4's pale tan — blue sits outside the red-green confusion
// axis so this is a more reliable separation than another green/brown shade would be); kom pushed
// toward teal (was a mid-green nearly matching flt's red at similar lightness).
//
// TASKS.csv #307 — the full pass #249 stopped short of, and a CONSTRAINED re-fit, not a repaint.
// Two measured defects. (1) LIGHTNESS CLUSTERING: twelve of the 28 codes sat between CIE L* 28 and
// 48 (v6/i6/m1/flt/kom/thol-fe/thol-mafic/ca-basalt/bas/and-bas/alk-bas/sub-alk). Lithology renders
// at LAYER_META.litho radius 2.2 world units — a two-or-three-pixel trace on a 37-hole overview —
// and at that width lightness is very nearly the only channel that survives antialiasing, so the
// overview read as a near-monochrome sage-green bundle. (2) obn (#8a7860) and v5 (#6b8060) were 6.7
// units apart under simulated deuteranopia and 0.5 under protanopia, i.e. the same colour to a
// red-green-CVD viewer — and both codes are in the shipped sample_data/ six-hole lithology log, so
// overburden vs. a mineralised host volcanic was indistinguishable in the app's own demo data.
//
// WHAT WAS DELIBERATELY PRESERVED, because it is domain meaning and not decoration:
//   * The hue families. Mafic volcanics stay dark green (v6/bas/ca-basalt, i6/thol-mafic, and-bas),
//     intermediates mid green (v5/ca-and/and), felsics tan/orange/gold (v1/ca-dac/rhy-dac, ca-rhy),
//     overburden warm brown/tan (obn), faults red (flt). A geologist reads those hues as meaning.
//   * The deliberate synonym sets — alternative NOMENCLATURES for the same rock, so they must keep
//     an identical hex and must always be edited as a group: v6/bas/ca-basalt, v5/ca-and/and,
//     v1/ca-dac/rhy-dac, and i6/thol-mafic. 21 distinct colours across 28 codes, unchanged.
//   * #249's three directional decisions: m1 warm brown, s6 blue, kom teal-green — all kept, only
//     re-levelled in lightness.
// The change is therefore a re-fit of LIGHTNESS (and chroma) inside each fixed hue family: an even
// L* ladder from 13.6 (s7) to 90.7 (m4) with a minimum adjacent gap of 1.8 and no gap of 0.0, so
// units separate at trace width instead of only when you zoom to a few holes. Codes left in the
// L* 28-48 band: six, down from twelve. obn was additionally moved off the green axis to the warm
// tan a cover unit conventionally gets — the same reasoning #249 used for s6 and kom — which takes
// obn/v5 from 6.7 to 106.2 (deuteranopia) and 0.5 to 112.4 (protanopia).
// VERIFIED with a Vienot-1999 LMS-projection dichromacy simulation over all pairs in BOTH
// deuteranopia and protanopia, using #306's ~25-unit simulated-sRGB collision threshold. On the
// eight codes that actually ship in sample_data/litho.csv the worst pair goes from 6.7/0.5 to
// 35.4/35.2 with zero pairs under 25; across the co-occurring base code set the worst is 29.1 and
// across the TAS/volcanic-classification set 25.0. Residual sub-25 pairs are all CROSS-nomenclature
// (e.g. s5 vs sub-alk) — two schemes that would not be logged in one project — and are the price of
// holding 21 colours inside six conventional hue families; see this row's notes for the full table.
export const LITHO_COLORS = {
  obn: "#d0b8a0", v1: "#dc7f4c", silbx: "#de6825", s5: "#6387b4", s4: "#bda683",
  s7: "#2a211a", v5: "#769961", v6: "#2e4433", i6: "#3c604f", m1: "#a27033",
  m4: "#f5e1d0", s6: "#97d2f9", flt: "#c40522",
  kom: "#52c58e", "thol-fe": "#7d2e22", "thol-mafic": "#3c604f", "ca-basalt": "#2e4433",
  "ca-and": "#769961", "ca-dac": "#dc7f4c", "ca-rhy": "#f6d48b",
  bas: "#2e4433", "and-bas": "#567c42", and: "#769961", "rhy-dac": "#dc7f4c",
  "alk-bas": "#743e65", trachy: "#d884c5", "sub-alk": "#327378", fono: "#5d78df",
};
export const UNIT_NAMES = {
  OBN: "OBN — Overburden", V1: "V1 — Meta-rhyolite flow", SILBX: "SILBX — Hydrothermal breccia",
  S5: "S5 — Meta-siltstone", S4: "S4 — Meta-greywacke", S7: "S7 — Argillite (graphitic)",
  V5: "V5 — Meta-andesite flow", V6: "V6 — Meta-basalt flow", I6: "I6 — Meta-gabbro/diabase dyke",
  M1: "M1 — Basalt-phyllite", M4: "M4 — Quartzite / silica phyllite", S6: "S6 — Calc-silicate rock",
  FLT: "FLT — Fault zone",
};
export function colorForLithology(u) { const k = (u || "").toLowerCase(); return LITHO_COLORS[k] || categoricalSafeColor("litho", u); }

// TASKS.csv #241 — Matt's own synthetic-dataset request came bundled with a second, standing ask: a
// way to tell overburden and cross-cutting units (faults, dykes, breccias) apart from ordinary
// stratigraphic ones, since today every lithology code is treated identically by the Modelling tools
// (an implicit-surface run has no idea "OBN" isn't basement, or that "FLT" cuts across everything else
// rather than sitting in stratigraphic order with it). This is the per-unit classification that
// downstream code (ViewerModule's Stack/Implicit tools, gatherLithoSurfaceSpec's surface `type`) reads
// from — new codes not listed here default to "stratigraphic" rather than guessing wrong.
export const UNIT_ROLES = {
  obn: "overburden",
  // TASKS.csv #871 — the usual casing / overburden codes (the Harry sample logs CAS and OVB): a unit starting under them
  // starts at the bedrock surface, not at a geological contact. Unambiguous codes only; others are set in Modelling codes.
  cas: "overburden", casing: "overburden", ovb: "overburden", ovbd: "overburden", ob: "overburden", overburden: "overburden",
  flt: "fault",
  i6: "dyke",
  silbx: "breccia",
};
// TASKS.csv #1369 (review #1352, Silvertip) — the usual full-word and acQuire-style codes, so FAULT, BRX, DYK, VEIN and NRCV no
// longer default to "stratigraphic" (every fault inside the McDame made a "Top of McDame"). Whole codes only, never a prefix
// (VBX, a volcanic breccia, stays a unit); they are suggestions the geologist changes in Modelling codes.
const ROLE_PATTERNS = [
  [/^(fault|faults|flt|fz|fltz|gouge|gge)$/, "fault"],
  [/^(bx|brx|breccia|hbx)$/, "breccia"],
  [/^(dyk|dyke|dike|dk)$/, "dyke"],
  [/^(vein|vn|qv|qtzv|qzv)$/, "vein"],
  [/^(nr|nrcv|norec|nrec|ncr|lost|core ?loss|void|cavity)$/, "no recovery"], // ncr: #2046 (Woodjam: lost core and a tricone precollar)
  // TASKS.csv #1688 (review #1645, Copley) — hydrothermal / igneous breccia codes, fine-grained dyke codes (IFGD: intermediate fine-grained
  // dyke; MFGD, FFGD), two- and three-letter *DK codes, and the common intrusive-rock codes (DIOR, GRDR, QFP, MZ, GD ...) were all
  // 'stratigraphic', so every breccia contact in COP-23-0001 became a top of the host volcanics. Whole codes only; suggestions.
  [/^(hybx|hbrx|hydbx|hydbrx|igbx|ibx)$/, "breccia"],
  [/^[a-z]{2}gd$|^[a-z]{1,2}dk$|^[a-z]{1,2}dyk$/, "dyke"], // *dyk: #2046 (Woodjam FDyk / MDyk / IDyk)
  [/^(dior|diorite|grdr|grd|granodiorite|qfp|fp|qp|qfpp|mz|mzn|qmz|monzonite|gd|porph|porphyry|tonl|tonalite|syen|syenite)$/, "dyke"],
  // TASKS.csv #1541 (review #1497, Lawyers) — whole WORDS inside a longer code too: 'Felsic Dyke', 'Mafic Dyke', 'I-Mafic' (intrusive),
  // 'No Recovery', 'Sand' were all 'stratigraphic' and offered in the Strat. stack. Still not a prefix of a word ('FAULTED LMST' and
  // 'veined' stay units) and breccia stays whole-code only ('Volcanic Breccia' is a unit). Suggestions; Modelling codes changes them.
  [/\b(dykes?|dikes?|dyk)\b|^i[-_ ]|\bintrusi(ve|on)\b/, "dyke"],
  [/\b(no ?rec(overy)?|core ?loss|lost core)\b/, "no recovery"],
  [/\b(fault|faults|fault zone|gouge)\b/, "fault"],
  [/\b(veins?)\b/, "vein"],
  [/^(sand|gravel|till|alluvium|alluvial|colluvium|colluvial|glacial till|moraine|cover)$|\b(alluvium|colluvium|glacial)\b/, "overburden"],
  // TASKS.csv #2537 (review #2486, WA lithium) — pegmatite, aplite, dolerite / diabase and lamprophyre were 'stratigraphic', so the ore-bearing
  // sheet of an LCT project joined the pile by default; made ground at hole starts on a mine site too. The spelled-out words and the
  // unambiguous short codes only: DOL (dolomite as often as dolerite), P, PG and NS (no sample, or net-textured sulphide) stay unrecognized.
  [/^(peg|pegm|pegmatite|apl|aplite|dolerite|diab|diabase|lamp|lamprophyre)$|\b(pegmatites?|aplites?|dolerites?|diabase|lamprophyres?)\b/, "dyke"],
  [/^(fill|backfill|made ground)$|\b(backfill|made ground)\b/, "overburden"],
];
// TASKS.csv #2046 (review #2013, Woodjam) — a code the name rules do not know is read from the notes logged with it, when the
// import kept a notes / description column: Woodjam's BMM ('... polymict breccia ... magmatic matrix'), its 13 intrusive I-codes
// ('monzonite', 'diorite') and NCR ('Lost Core Interval', 'Tricone through overburden') all defaulted to 'stratigraphic', so lost
// core and dykes made false unit tops. A role wins when at least half of the code's rows that carry a note say it. The store
// registers the result (setLithologyNoteRoles) whenever the lithology layer changes; names still come first.
// TASKS.csv #2227 (review #2174, WA lode gold) — the WA log's vein, shear and no-recovery codes (VQZ 'vuggy qtz', BSZ 'as previous sz',
// NPRC 'shotcrete' / 'cement!' / 'core not present', NLST 'tray thrown out') were all 'stratigraphic', so 36 % of a unit's run starts sat
// under them as false tops. Read from the notes, never from a code prefix (V*, B*, N* mean other things on other deposits).
const NOTE_RULES = [
  // shotcrete…: #2227. TASKS.csv #3254 (#3195, Galore Creek modelling) — not the bare word 'cement': a breccia's notes describe its cement ('silica
  // cement', 'cemented by tourmaline'), and code B (145 intervals) was read as no recovery and ignored by the modelling tools. Cement is no
  // recovery when the note is only that ('cement!', the WA log's), or a cement plug / grout in the hole.
  [/\b(lost core|core loss|no (core )?recovery|tricone|pre-?collar|casing|shotcrete|not present|thrown out|cement(ed)? (plug|grout)|grout(ed)?)\b|^\W*(cement|concrete)\W*$/, "no recovery"],
  [/\b(fault breccia|fault gouge|flt (breccia|bx|gouge)|gouge)\b/, "fault"], // Woodjam UTB 'fault breccia', UTG 'flt gouge'
  [/\b(shear( zone)?|sz|fault zone)\b/, "fault"], // #2227 — a shear zone cuts the pile like a fault (BSZ 'carbonate veins within the shear')
  [/\b(dykes?|dikes?)\b/, "dyke"],
  [/\bbreccia\b[^.;]*\b(magmatic|hydrothermal|intrusive|igneous)\b|\b(magmatic|hydrothermal|intrusive|igneous)\b[^.;]*\bbreccia\b/, "breccia"],
  [/\b(q(t)?z ?monz(onite)?|monz(onite)?|monzodiorite|qmz|dior(ite)?|granodiorite|grdr|granite|tonalite|syenite|gabbro|porphyry|intrusions?|intrusive)\b/, "dyke"], // monz / dior: logged abbreviations (Woodjam 'mg qtz monz')
  // #2227 — a vein only when the note STARTS by describing one ('laminated qtz vein', 'vuggy qtz', 'qcb breccia'): host-rock notes mention veins
  // all the time (Woodjam's ICMOQ 'qtz monz … strg vein alt', its BX '… stockwork of qtz veining'), and those are not vein codes. Last, after the intrusive words.
  [/^\W*(((laminated|vuggy|massive|banded|white|milky|grey) )?(q(t)?z|quartz|qcb|carb(onate)?|cb)?[ -]?(veins?|vein breccia)\b|(vuggy|laminated) (q(t)?z|quartz)\b|qcb\b)/, "vein"],
];
const NOT_NOTES = new Set(["hole_id", "value", "_src", "codes", "all_codes", "alt_style", "from", "to", "mcode", "source"]);
// TASKS.csv #2175 — the store re-runs this on every lithology change: 1.5 M rows took 1.1 s on the main thread. A code's role is a majority of
// its noted rows, so its first NOTE_SAMPLE noted rows decide it; after that its rows are skipped before any text is built.
const NOTE_SAMPLE = 400;
export function lithologyNoteRoles(rows) {
  const by = new Map(); // code -> { noted, hits: { role: n } }
  const keys = new Set(); // #3147 — every code, for the cover check
  const lastKey = { raw: undefined, key: "" }; // logs run code by code: reuse the last key while the raw value repeats
  for (const r of rows || []) {
    if (!r || r.value == null) continue;
    if (r.value !== lastKey.raw) { lastKey.raw = r.value; lastKey.key = String(r.value).trim().toLowerCase(); keys.add(lastKey.key); }
    if (by.get(lastKey.key)?.noted >= NOTE_SAMPLE) continue;
    let text = "";
    for (const k in r) { const v = r[k]; if (typeof v === "string" && v.length > 3 && !NOT_NOTES.has(k)) text += " " + v; } // #3147: no entries array per row
    if (!text) continue;
    const key = lastKey.key;
    let e = by.get(key); if (!e) by.set(key, (e = { noted: 0, hits: {} }));
    e.noted++;
    const t = text.toLowerCase();
    const hit = NOTE_RULES.find(([re]) => re.test(t));
    if (hit) e.hits[hit[1]] = (e.hits[hit[1]] || 0) + 1;
  }
  const out = new Map();
  by.forEach((e, key) => {
    const best = Object.entries(e.hits).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= e.noted / 2) out.set(key, best[0]);
  });
  coverRoles(rows, keys, out);
  return out;
}
// TASKS.csv #3147 (split from #2926, WA iron review) — the cover was 'stratigraphic' by default: ALU (alluvium) and CLA (clay) at the top of
// the holes joined the pile and made false unit tops under them. A code is suggested as overburden when BOTH its name reads as cover (whole
// short codes, or the spelled-out words; never 'clay' inside a longer name: 'clay altered granite' is rock) AND it lies at the top of the
// holes: in at least COVER_TOP_SHARE of the holes that log it, it starts above every rock interval (a code that is neither a cover name,
// overburden nor no recovery). The name alone is not enough (CLA, COL, DET mean other things elsewhere); the place alone is not either
// (a hole's first unit is often bedrock, or 'not logged'). Detrital codes whose names do not say so (the WA log's DIW, DID) are left to the
// geologist. A note role wins over it. out.cover keeps each suggested code's share, for the pane's tooltip.
const COVER_NAME = /^(alu|allu|alluv|alv|cla|cly|clay|clays|col|coll|colluv|det|detr|detrital|detritals|detritus|soil|topsoil|scree|talus|transported)$|\b(alluvium|alluvial|colluvium|colluvial|detritals?|detritus|topsoil|scree|talus|transported cover)\b/;
export const COVER_TOP_SHARE = 0.6; // rock codes lie on top in a few % of their holes (WA iron: 0-7 %); the cover in most (ALU 99 %, CLA 73 %)
const COVER_MIN_HOLES = 3;
// like the note sample (#2175): a share needs a few hundred holes, not every one; the pass stops at a hole's start once every candidate has
// been seen in COVER_SAMPLE holes (a log runs hole by hole, so the holes read are whole)
const COVER_SAMPLE = 1000;
const NOT_ROCK = new Set(["overburden", "no recovery"]);
function coverRoles(rows, keys, out) {
  const cand = new Set([...keys].filter((k) => k !== "unknown" && !UNIT_ROLES[k] && !ROLE_PATTERNS.some(([re]) => re.test(k)) && !out.has(k) && COVER_NAME.test(k)));
  if (!cand.size) return;
  const rock = (k) => !cand.has(k) && k !== "unknown" && !NOT_ROCK.has(UNIT_ROLES[k] || ROLE_PATTERNS.find(([re]) => re.test(k))?.[1] || out.get(k));
  const holes = new Map(); // hole -> { rock: top of the first rock interval, cand: Map(code -> its top) }
  const isRock = new Map();
  // logs run hole by hole and code by code: the last hole's record and the last value's kind are reused while they repeat
  let lastRaw, key = "", isCand = false, rk = false, lastHole, h = null;
  const seen = new Map([...cand].map((k) => [k, 0]));
  let short = cand.size; // candidates seen in fewer than COVER_SAMPLE holes
  for (const r of rows) {
    if (!r || r.value == null || r.hole_id == null) continue;
    const from = +r.from;
    if (!(from === from) || from === Infinity || from === -Infinity) continue;
    if (r.value !== lastRaw) {
      lastRaw = r.value; key = String(r.value).trim().toLowerCase(); isCand = cand.has(key);
      if (!isCand) { rk = isRock.get(key); if (rk === undefined) isRock.set(key, (rk = rock(key))); }
    }
    if (r.hole_id !== lastHole) {
      if (!short) break;
      lastHole = r.hole_id; h = holes.get(lastHole); if (!h) holes.set(lastHole, (h = { rock: Infinity, cand: new Map() }));
    }
    if (isCand) {
      const t = h.cand.get(key);
      if (t === undefined) { const n = seen.get(key) + 1; seen.set(key, n); if (n === COVER_SAMPLE) short--; }
      if (t === undefined || from < t) h.cand.set(key, from);
    }
    else if (rk && from < h.rock) h.rock = from;
  }
  const tally = new Map(); // code -> [holes, holes where it is on top]
  holes.forEach((h) => h.cand.forEach((top, k) => { let t = tally.get(k); if (!t) tally.set(k, (t = [0, 0])); t[0]++; if (top < h.rock) t[1]++; }));
  const share = new Map();
  tally.forEach(([n, onTop], k) => { if (n >= COVER_MIN_HOLES && onTop >= COVER_TOP_SHARE * n) { out.set(k, "overburden"); share.set(k, onTop / n); } });
  if (share.size) out.cover = share;
}
// #3147 — the share of its holes a code was found on top in, when the cover check suggested it (else null)
export function coverTopShare(u) { return noteRoles?.cover?.get(String(u || "").trim().toLowerCase()) ?? null; }
let noteRoles = null;
export function setLithologyNoteRoles(map) { noteRoles = map && map.size ? map : null; }
// TASKS.csv #3735 (Scottie Gold import review) — the project's own meaning of each lithology code (the code dictionary, lib/codeDictionary.js): the 3D legend read 'FLT — Fault zone'
// where the file says 'gouge' and bare codes for the rest; the overburden / casing roles never saw a dictionary that says 'overburden' / 'casing' for OVBN / CSG.
// Set by the store (as the note roles are); a code with no entry keeps the built-in name.
let lithoMeanings = null; // lower-cased code -> description
export function setLithologyMeanings(dict) {
  const m = new Map();
  for (const [k, e] of Object.entries(dict || {})) { const d = String(e?.desc ?? "").trim(); if (d) m.set(String(k).trim().toLowerCase(), d); }
  lithoMeanings = m.size ? m : null;
}
// TASKS.csv #3840 follow-up — the code dictionary's own words for a code (no 'CODE — ' prefix), or null
export function lithoMeaningText(u) { return lithoMeanings?.get(String(u ?? "").trim().toLowerCase()) || null; }
export function lithoMeaning(u) { const d = lithoMeanings?.get(String(u ?? "").trim().toLowerCase()); return d ? `${u} — ${d}` : null; }
// TASKS.csv #3840 — a description is read by its first words too: 'Overburden (till)', 'overburden and casing', 'glacial till', 'no core recovery' are cover or no recovery; only the HEAD of the
// text counts ('Tricone through overburden' and 'sandstone under overburden' are not cover)
const MEANING_HEAD = [[/^\W*(overburden|casing|casing and overburden|(glacial |basal )?(till|drift)|topsoil)\b/, "overburden"], [/^\W*(no (core )?recovery|lost core|core loss)\b/, "no recovery"]];
const meaningRole = (k) => { const d = lithoMeanings?.get(k)?.toLowerCase(); return d ? (UNIT_ROLES[d] || ROLE_PATTERNS.find(([re]) => re.test(d))?.[1] || MEANING_HEAD.find(([re]) => re.test(d))?.[1] || null) : null; };
// TASKS.csv #3778 — the role came from the code's meaning in the code dictionary (not from its name, nor its notes): the dictionary's words for it, else null; the Modelling codes tooltip says so
export function roleMeaningText(u) {
  const k = String(u || "").trim().toLowerCase();
  if (k === "unknown" || UNIT_ROLES[k] || ROLE_PATTERNS.some(([re]) => re.test(k))) return null;
  return meaningRole(k) ? lithoMeanings.get(k) : null;
}
// TASKS.csv #2537 — the role came from the default ('stratigraphic' for a code nothing recognises), not from a rule: the pane marks it
export function roleIsAssumed(u) {
  const k = String(u || "").trim().toLowerCase();
  return k !== "unknown" && !UNIT_ROLES[k] && !ROLE_PATTERNS.some(([re]) => re.test(k)) && !noteRoles?.get(k) && !meaningRole(k);
}
// TASKS.csv #3366 (#3195, Galore Creek) — the role came from the code's notes (#2046), not from its name: the Subcrop pane says so beside a
// code it skipped as cover, so a wrong guess (breccia B read as no recovery from its cement, #3254) can be seen and unticked
export function roleIsFromNotes(u) {
  const k = String(u || "").trim().toLowerCase();
  return k !== "unknown" && !UNIT_ROLES[k] && !ROLE_PATTERNS.some(([re]) => re.test(k)) && !!noteRoles?.get(k);
}
export function roleForLithology(u) {
  const k = String(u || "").trim().toLowerCase();
  if (k === "unknown") return "no recovery"; // TASKS.csv #2227 — the label blank cells import as (#2182) is not logged rock: never a unit, never a role from notes
  return UNIT_ROLES[k] || ROLE_PATTERNS.find(([re]) => re.test(k))?.[1] || meaningRole(k) /* #3735 */ || noteRoles?.get(k) || "stratigraphic";
}
// Cross-cutting = doesn't belong in an ordered, non-crossing stratigraphic pile (see the Stack tool's
// own scope comment in ViewerModule.jsx) — faults, dykes, breccia bodies and veins (#1369) all qualify.
// TASKS.csv #2226 (review #2174, WA lode gold) — the Vein / dyke tool listed only the Veins log: a company that logs its veins as lithology codes
// (VQZ 207, VCB 227 intervals) had an empty list and no word why. Its codes: the Veins log's, then the lithology codes that are cross-cutting
// (the Modelling codes role, else the suggestion from the name or the notes), as 'litho:<code>'.
// #2175 — ViewerModule calls this on every render: the distinct codes of a rows array are kept until the array changes (a 1.5 M-row log was
// scanned again on each render)
const DISTINCT_CODES = new WeakMap();
// TASKS.csv #3767 — lithoGroups: a lithology group whose role is cross-cutting (its Modelling codes role, else its members') is ONE vein / dyke unit, 'mcode:<group>' (its
// rows by their effective code, as a sheet split out in Modelling codes is), offered in place of its member codes (ASDA + ASDS never appeared: only raw codes did)
export function veinSourceUnits(layers, modellingCodes = null, lithoGroups = null) {
  const seen = (rows) => {
    if (!rows) return [];
    let v = DISTINCT_CODES.get(rows);
    if (!v) { const s = new Set(); for (const r of rows) { const x = r?.value; if (x != null && String(x).trim() !== "") s.add(x); } v = [...s]; DISTINCT_CODES.set(rows, v); }
    return v;
  };
  const set = new Map((modellingCodes?.codes || []).map((c) => [c.name, c.role]));
  const crossCutting = (v) => (set.get(v) || mcodeRoleOf(roleForLithology(v))) === "cross-cutting";
  // TASKS.csv #2533 (review #2486) — the refusal of a sheet swarm sent the user to split it in Modelling codes, and the codes made there
  // (P1 ... P32, set cross-cutting) were not offered here: a cross-cutting modelling code that some interval carries is ('mcode:<name>'), and
  // a raw code every interval of which was re-coded away is not offered any more
  const litho = layers?.litho || [];
  const assign = modellingCodes?.assign || {};
  const carried = new Set(), stillRaw = new Set();
  if (Object.keys(assign).length) for (const r of litho) { const o = assign[rowKey(r)]; if (o) carried.add(o); else if (r?.value != null) stillRaw.add(r.value); }
  const rawKept = (v) => !Object.keys(assign).length || stillRaw.has(v);
  const mcodes = (modellingCodes?.codes || []).filter((c) => c.role === "cross-cutting" && carried.has(c.name) && !seen(litho).includes(c.name)).map((c) => `mcode:${c.name}`);
  const groups = (lithoGroups || []).filter((g) => g?.name && (g.codes || []).length);
  const grouped = new Set(groups.flatMap((g) => g.codes || []));
  const groupUnits = groups.filter((g) => (g.codes || []).some((c) => seen(litho).includes(c)) && (set.get(g.name) || groupMcodeRole(g.name, groups)) === "cross-cutting" && !mcodes.includes(`mcode:${g.name}`)).map((g) => `mcode:${g.name}`);
  return [...seen(layers?.vein), ...seen(litho).filter((v) => crossCutting(v) && rawKept(v) && !grouped.has(v)).map((v) => `litho:${v}`), ...mcodes, ...groupUnits];
}
export function isCrossCuttingRole(role) { return role === "fault" || role === "dyke" || role === "breccia" || role === "vein"; }
// a Modelling codes role from a unit role (#599 roles: stratigraphic / overburden / cross-cutting / ignore)
export function mcodeRoleOf(role) { return role === "overburden" ? "overburden" : role === "no recovery" ? "ignore" : isCrossCuttingRole(role) ? "cross-cutting" : "stratigraphic"; }

// TASKS.csv #249 (colorblind-safety review) — CHL/PRO and SER/QSP were exact-duplicate hex values
// (not even a colorblind-specific issue — indistinguishable to anyone), and OX/KSP were a
// red-brown/dark-red pair that collapses under deuteranopia/protanopia. Nudged CHL toward a more
// saturated green and SER toward a warmer gold so both read distinctly at normal AND reduced
// red-green discrimination; OX kept but KSP shifted toward a cooler plum so the two no longer share
// the same reddish-brown hue family.
export const ALT_COLORS = { CARB: "#b8c4c8", KSP: "#7a4a72", MAG: "#4a4a4a", OX: "#b5622c", PRO: "#4a6b4a", QSP: "#d4b06a", SIL: "#e8e2d0", UNK: "#6a6a6a",
  SER: "#c79a4a", CHL: "#5a8f52", EPI: "#7a9e6a", FRESH: "#5a6472",
  "SER-POT": "#94507f", "SER-PHY": "#e0b860" }; // TASKS.csv #2145 — the AI-up trend named from the log: K-feldspar's plum, sericite's gold
export function colorForAlteration(a) { return ALT_COLORS[(a || "").toUpperCase()] || categoricalSafeColor("alt", a); }

// TASKS.csv #249 (colorblind-safety review) — QZ-CB was a pale green nearly identical to CARB
// (and close to QZ-CHL too); shifted to pale blue, outside the red-green confusion axis, so the two
// carbonate-bearing vein codes stay distinguishable under deuteranopia/protanopia.
export const VEIN_COLORS = { CARB: "#a8c4a0", PY: "#c9c93d", "QTZ-PY": "#d4c060", QZ: "#e8e2d0", "QZ-CB": "#7fb0c2", "QZ-CHL": "#7fae7a", "QZ-SUL": "#b08a5a" };
export function colorForVein(v) { return VEIN_COLORS[(v || "").toUpperCase()] || categoricalSafeColor("vein", v); }

// TASKS.csv #608 — breccia logs (an MX "Breccia" table: assemblage monomict / polymict, support, genesis)
// are their own layer; they used to be detected as Alteration and merged into it.
export const BRECCIA_COLORS = { MONOMICT: "#9a7f63", POLYMICT: "#b0552f", HYDROTHERMAL: "#c9a03c", FAULT: "#6f5f86", TECTONIC: "#6f5f86", MAGMATIC: "#a3486a", PHREATOMAGMATIC: "#4f7f8f", CRACKLE: "#d4b98a", MOSAIC: "#8f9a5a" };
export function colorForBreccia(v) { return BRECCIA_COLORS[(v || "").toUpperCase()] || categoricalSafeColor("breccia", v); }
// TASKS.csv #2162 (WA drillhole review) — weathering / oxidation / regolith codes as a ramp from fresh rock (grey) through the weathering
// grades to the oxidised, saprolite and cover profile (warm colours), so a section reads as the profile does; other codes get a colour of their own.
export const WEATH_COLORS = {
  FR: "#5b6770", FRESH: "#5b6770", F: "#5b6770", SW: "#7f8a6c", SLW: "#7f8a6c", MW: "#a8975a", MOD: "#a8975a", HW: "#c47a3a", CW: "#b4552c", XW: "#b4552c", EW: "#b4552c",
  OX: "#a23b1f", OXD: "#a23b1f", OXIDE: "#a23b1f", TR: "#c79a4a", TRANS: "#c79a4a", TRN: "#c79a4a", TZ: "#c79a4a", PO: "#c79a4a",
  SAP: "#c98b42", USAP: "#d4943e", LSAP: "#b8864a", SAPRK: "#9c8c66", SPRK: "#9c8c66", SR: "#9c8c66",
  COV: "#e3cf8a", CVR: "#e3cf8a", TPT: "#e3cf8a", TRNP: "#e3cf8a", ALL: "#e3cf8a", LAT: "#7a2e1a", FERR: "#7a2e1a", DUR: "#8c4a2a", CLAY: "#d9b98c", MOT: "#c9a27a",
};
export function colorForWeathering(v) { return WEATH_COLORS[String(v || "").toUpperCase().replace(/[\s_-]+/g, "")] || categoricalSafeColor("weath", v); }

// TASKS.csv #3332 — CPY and PY were two near golds (#d4af37 / #d4c060, CIE76 dE 15) and PO and SPH two browns (dE 22): CPY now orange-brass, PY pale
// brass, PO bronze-pink; every pair here is at least dE 34 apart
export const MIN_COLORS = { ACA: "#c8c8d8", CPY: "#d08a1c", GAL: "#6a6a78", PO: "#c0907a", PY: "#e6d65a", SPH: "#6a3a2a" };
export function colorForMineral(m) { return MIN_COLORS[(m || "").toUpperCase()] || categoricalSafeColor("mineral", m); }

export const STRUCT_COLORS = { ALT: "#c9863d", BD: "#4a7ab5", CON: "#8a6fae", FLT: "#c0392b", FOL: "#3a8a8a", FOLD: "#4aa06a", SHZ: "#a5407a", VN: "#cfc7b0" };
export function colorForStructure(t) { return STRUCT_COLORS[(t || "").toUpperCase()] || categoricalSafeColor("structure", t); }
// TASKS.csv #604 — structural ZONES logged as from / to intervals (fault, fracture, shear zones), as logging software
// exports them (Copley 2023: Struc_Code FR / FL; Woodjam 2023: Structure_Type FLTBX). Faults red, fractures orange,
// shears magenta; anything else gets the usual distinct categorical colour.
export const STRUCTZONE_COLORS = { FL: "#c0392b", FLT: "#c0392b", FZ: "#c0392b", FLTBX: "#8e1f16", GOUGE: "#7a2a20", FR: "#e08a2e", FRAC: "#e08a2e", FX: "#e08a2e", JNT: "#d9b44a", SHZ: "#a5407a", SZ: "#a5407a", SH: "#a5407a", BX: "#8a6a45" };
export function colorForStructZone(v) { return STRUCTZONE_COLORS[(v || "").toUpperCase()] || categoricalSafeColor("structzone", v); }

// TASKS.csv #228 — surface geochemistry sample media, colored distinctly by sampling medium (a soil
// grid and a rock-chip traverse from the same property are visually different datasets, same as
// lithology/alteration get their own color set here) so mixed surface-sample imports read clearly in
// the 3D view and the legend, rather than falling back to one uniform color for everything.
export const MEDIUM_COLORS = { soil: "#8a6a45", "rock chip": "#c0392b", "stream sediment": "#4a7ab5", "moss mat": "#3f8f5a", "heavy mineral concentrate": "#7a4fa3", bleg: "#c58b1a", "stream water": "#5fb3c9", "talus fines": "#8a8578", other: "#6a6a6a" }; // #845 stream media
export function colorForMedium(m) { return MEDIUM_COLORS[(m || "").toLowerCase()] || categoricalSafeColor("medium", m); }

// TASKS.csv #249 (colorblind-safety review) — this was a literal red→orange→gold→green traffic-light
// ramp for RQD% (rock quality, a real geotechnical decision input), the single highest-priority
// finding in that review: red-green "bad→good" is exactly the transition deuteranopia/protanopia
// can't read. Replaced with a 5-stop viridis sample (dark purple=poor rock → bright yellow=good rock)
// — perceptually uniform and colorblind-safe by construction, same palette already offered elsewhere
// in the app (PALETTES.viridis) rather than inventing a second "safe" ramp with different stops.
export function rqdColor(pct) {
  if (pct == null || isNaN(pct)) return "#555";
  const stops = [[0, [68, 1, 84]], [25, [59, 82, 139]], [50, [33, 144, 140]], [75, [93, 200, 99]], [100, [253, 231, 37]]];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (pct >= stops[i][0] && pct <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  const span = hi[0] - lo[0], t = span <= 0 ? 0 : (pct - lo[0]) / span;
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// TASKS.csv #209 — split out the numeric math so a hot per-instance loop (ViewerModule's voxel
// InstancedMesh build) can get plain [r,g,b] numbers directly instead of round-tripping through a
// freshly-allocated "rgb(...)" string just to have three.js's Color.setStyle() immediately re-parse
// it via regex — a real, profiled cost at multi-hundred-thousand-cell scale (see that call site's own
// comment for the measured before/after). magColor itself is unchanged for every other caller that
// actually wants a CSS color string (legend swatches, etc).
// TASKS.csv #382 — the default continuous ramp is now viridis. The old blue -> red RGB lerp measured
// L* 44-52 from end to end with a muddy grey-purple middle: under 3D shading there was no lightness cue
// at all for "high" vs "low", and it is hard for red-green colour-blind users. Viridis rises
// monotonically in lightness (dark purple = low, yellow = high). A 256-entry table is built once because
// this runs per voxel cell / per grid node.
export const VIRIDIS_ANCHORS = [[68, 1, 84], [65, 68, 135], [42, 120, 142], [34, 168, 132], [122, 209, 81], [253, 231, 37]];
const DEFAULT_LUT = (() => {
  const out = new Array(256);
  for (let i = 0; i < 256; i++) {
    const s = (i / 255) * (VIRIDIS_ANCHORS.length - 1), k = Math.min(VIRIDIS_ANCHORS.length - 2, Math.floor(s)), f = s - k;
    out[i] = VIRIDIS_ANCHORS[k].map((x, j) => Math.round(x + (VIRIDIS_ANCHORS[k + 1][j] - x) * f));
  }
  return out;
})();
export function magColorRGB(v, min, max) {
  const t = max <= min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
  return DEFAULT_LUT[Math.round(t * 255)];
}
export function magColor(v, min, max) {
  const c = magColorRGB(v, min, max);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export { hashColor };

// ---- voxel/block-model color ramps (user request: import an OMF file's own colour legend, and be
// able to edit colours/ranges/classify them from the layers panel, same as any GIS package's raster/
// block-model symbology). A model's colour is driven by an ordered list of {value, color} "stops" —
// either imported straight from the OMF file's ScalarColormap gradient (see omf.js's convertColormap),
// or generated here by classifyBreaks, or hand-edited by the user in GeophysicsModule's VoxelModelRow.
// Models with no stops at all (plain UBC/CSV imports, or an OMF file with no embedded colormap) keep
// using the original 2-color magColor gradient below — this is purely additive, no existing model's
// appearance changes unless it actually has stops.

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}
function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function lerpColorHex(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}


// User request: "Can we have some gradient colour pallets options for the voxels legends? Get some
// that are typically used in geophysics and name them with the suggested geophysical survey type use."
// Each entry is an ordered list of hex anchor colors sampled evenly across a model's value range —
// same multi-stop-lerp approach VoxelLegendEditor's Classify control already used for the 2-color
// default, just generalized to N anchor colors per palette instead of always exactly 2.
// TASKS.csv #249 (colorblind-safety review) — geosoft/rainbow/resistivity are all rainbow/jet-style
// ramps that sweep straight through the green-yellow-red band, the worst-case transition for
// deuteranopia/protanopia; kept (not removed) since they intentionally mirror conventions from
// Oasis montaj/EM/resistivity software a geophysicist may already expect, but labeled so the tradeoff
// is visible in the picker instead of silent.
export const PALETTES = {
  // TASKS.csv #382 — kept by name for saved models that use it, but no longer the default (see magColorRGB).
  default:     { label: "Blue → Red (legacy; no lightness change, avoid)", colors: ["#4669be", "#dc463c"] },
  geosoft:     { label: "Spectrum — magnetics / gravity (classic Oasis montaj default; not colorblind-safe)", colors: ["#1c1c8c", "#0050c8", "#00b4dc", "#28c878", "#c8e600", "#ffaa00", "#ff3200", "#c80028"] },
  // User request: "we need a colour palette that includes magenta" — Oasis montaj's default
  // chargeability/IP spectrum wraps the full hue wheel and ends in magenta/pink at the high end,
  // which none of the ramps above do (geosoft above tops out at dark red). Additive: the existing
  // geosoft ramp's anchors plus one magenta anchor appended, so nothing already using "geosoft" changes.
  spectrum:    { label: "Full spectrum — chargeability / IP (Geosoft-style, wraps into magenta; not colorblind-safe)", colors: ["#1c1c8c", "#0050c8", "#00b4dc", "#28c878", "#c8e600", "#ffaa00", "#ff3200", "#c80028", "#c8007a"] },
  rainbow:     { label: "Rainbow — magnetics / gravity / EM (not colorblind-safe)",  colors: ["#3b3bbe", "#1e90d2", "#28b4a0", "#5ac832", "#e6dc1e", "#f08c1e", "#e63c28"] },
  resistivity: { label: "Resistivity / IP (low→high resistivity; not colorblind-safe)", colors: ["#c83c28", "#f08c1e", "#e6dc1e", "#5ac832", "#28b4a0", "#1e90d2", "#3b3bbe"] },
  viridis:     { label: "Viridis — general purpose / any survey", colors: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"] },
  diverging:   { label: "Diverging Blue–White–Red — residual / anomaly grids", colors: ["#3b4cc0", "#a1c4fd", "#f7f7f7", "#f4a582", "#b40426"] },
  grayscale:   { label: "Greyscale — radiometrics / amplitude data", colors: ["#1a1a1a", "#8c8c8c", "#f2f2f2"] },
};

// Samples N evenly-spaced colors along a named palette's anchor-color gradient (piecewise-linear
// through every anchor, same idea as colorForVoxelValue's continuous stop interpolation below, just
// against a fixed named ramp instead of a model's own editable stops).
// TASKS.csv #1859 (review #1646, Kodiak) — a palette's short name for a select: cut at ' — ' or ' (' ('Resistivity / IP (low→high
// resistivity; not colorblind-safe)' had no ' — ', so its full text widened the raster card's Ramp select to 319 px in a 249 px card)
export const paletteShortName = (key) => String(PALETTES[key]?.label ?? key).split(" — ")[0].split(" (")[0];
export function paletteColorsHex(paletteKey, n) {
  const anchors = PALETTES[paletteKey]?.colors || PALETTES.default.colors;
  const count = Math.max(1, n);
  if (anchors.length === 1) return Array.from({ length: count }, () => anchors[0]);
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0 : i / (count - 1);
    const scaled = t * (anchors.length - 1);
    const idx = Math.min(anchors.length - 2, Math.floor(scaled));
    return lerpColorHex(anchors[idx], anchors[idx + 1], scaled - idx);
  });
}

// TASKS.csv #209 — perf fix, profiled not guessed. colorForVoxelValue below re-sorts model.stops AND
// re-parses every stop's hex string on EVERY call — fine for a one-off UI lookup, but ViewerModule's
// voxel InstancedMesh build calls this ONCE PER CELL, so a model with hundreds of thousands of cells
// (a real OMF import with its own colour legend — exactly what a heavy real-world voxel model looks
// like) was re-sorting the same handful of stops and re-parsing the same hex strings that many times
// over, then handing the result to three.js's Color.setStyle() for yet another parse. This factory
// does the sort + hex-parse ONCE per model and returns a closure that only does the cheap per-value
// lookup/interpolation, in plain numbers — no strings anywhere in the hot path. Used by ViewerModule's
// voxel-build effect; colorForVoxelValue itself is untouched and still used by every non-hot-loop
// caller (legend swatches, the section/fence-diagram color lookup, etc) that wants a CSS string.
export function makeVoxelColorResolverRGB(model) {
  const stops = model?.stops;
  if (!stops || !stops.length) {
    const r = voxelStretch(model), min = r ? r[0] : model?.min, max = r ? r[1] : model?.max; // #1812
    return (value) => magColorRGB(value, min, max);
  }
  const sorted = [...stops].sort((a, b) => a.value - b.value).map((s) => ({ value: s.value, rgb: hexToRgb(s.color) }));
  const discrete = model.colorMode === "discrete";
  return (value) => {
    if (discrete) { // the last stop at or below the value (else the first); #3365: a binary search, not a scan of every stop per cell
      let lo = 0, hi = sorted.length - 1, k = 0;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (value >= sorted[m].value) { k = m; lo = m + 1; } else hi = m - 1; }
      return sorted[k].rgb;
    }
    if (value <= sorted[0].value) return sorted[0].rgb;
    if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].rgb;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (value >= a.value && value <= b.value) {
        const t = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value);
        return [
          Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
          Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
          Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
        ];
      }
    }
    return sorted[sorted.length - 1].rgb;
  };
}

// Resolves a voxel/block-model cell's display color, honoring the model's own stops+colorMode when
// present, else falling back to the original continuous 2-color magColor(value, min, max) behavior.
export function colorForVoxelValue(model, value) {
  const stops = model?.stops;
  if (!stops || !stops.length) { const r = voxelStretch(model); return magColor(value, r ? r[0] : model?.min, r ? r[1] : model?.max); } // #1812 — the 2-98 % stretch
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (model.colorMode === "discrete") {
    let color = sorted[0].color;
    for (const s of sorted) { if (value >= s.value) color = s.color; else break; }
    return color;
  }
  // continuous: linear-interpolate between the two stops bracketing this value
  if (value <= sorted[0].value) return sorted[0].color;
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value);
      return lerpColorHex(a.color, b.color, t);
    }
  }
  return sorted[sorted.length - 1].color;
}

// Standard-normal inverse CDF (probit), Acklam's rational approximation — good to ~1.15e-9.
// Used by classifyBreaks' "normal" method; no library dependency needed for this one function.
function probit(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

// "Classify" — generate N breakpoints (each the LOWER bound of its class) from a value array, the
// same equal-interval/quantile options standard GIS packages offer for choropleth/raster symbology.
// User request: "I wanna have these options like geosoft [has], to better classify the voxel" —
// Oasis montaj's Colour Tool offers Linear/Log-Linear/Normal distribution/Histogram equalization as
// classification methods; "equal" below is Linear, "quantile" is already equal-count-per-bin (i.e.
// Histogram equalization), and "log"/"normal" are new to match the remaining two. Geosoft's "Custom"
// needs no method of its own — both callers already let a user hand-edit stops after classifying.
// TASKS.csv #1531 (review #1497, Lawyers) — the values class breaks are placed on: the 1st-99th percentiles, so a few keying errors
// (RQD 295 %) do not spread the classes (equal intervals 0 / 59 / 118 / 177 / 236 left 4 of 5 classes for impossible values). Breaks
// are class lower bounds, so values beyond still take the end classes. -> { values, lo, hi, below, above }
export function trimForBreaks(values, pLo = 0.01, pHi = 0.99) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length < 20) return { values: nums, lo: nums[0], hi: nums[nums.length - 1], below: 0, above: 0 };
  const at = (p) => nums[Math.min(nums.length - 1, Math.max(0, Math.round(p * (nums.length - 1))))];
  const lo = at(pLo), hi = at(pHi), kept = nums.filter((v) => v >= lo && v <= hi);
  return { values: kept, lo, hi, below: nums.filter((v) => v < lo).length, above: nums.filter((v) => v > hi).length };
}
// TASKS.csv #1422 — readable class breaks and stop values: the fewest significant figures (3 at least, as #1198 gave Jenks) that keep
// neighbouring values that differ apart. Rounding to a fixed number of significant figures keeps the order.
// TASKS.csv #1594 (review #1497, Lawyers) — two values that differ only past the 9th digit (the last stop and the model's max, the same
// number computed twice: ...408922 vs ...408925) made it give up and print every value with 17 digits; they count as equal here.
const nearlyEqual = (a, b) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)));
export function readableValues(values, minSig = 3) {
  for (let p = minSig; p <= 9; p++) {
    const r = values.map((v) => (Number.isFinite(v) && v !== 0 ? Number(v.toPrecision(p)) : v));
    if (r.every((x, i) => i === 0 || nearlyEqual(values[i], values[i - 1]) || x !== r[i - 1])) return r;
  }
  return values.slice();
}
// TASKS.csv #2402 (review #2325) — a range read at least to the units of its larger end (a total field: 57,392 to 57,571 nT, its anomaly
// is in the last digits), more figures where the two ends would otherwise read alike. asPair: [lo, hi] strings instead of 'lo to hi'.
export function rangeText(lo, hi, asPair = false) {
  const m = Math.max(Math.abs(lo), Math.abs(hi));
  const sig = Math.max(3, m >= 1 ? Math.floor(Math.log10(m)) + 1 : 3);
  const [a, b] = readableValues([lo, hi], sig).map((v) => v.toLocaleString(undefined, { maximumFractionDigits: 10 }));
  return asPair ? [a, b] : `${a} to ${b}`;
}
export function classifyBreaks(values, n, method = "equal") {
  const b = classifyBreaksRaw(values, n, method);
  const r = b.length ? [b[0], ...readableValues(b).slice(1)] : b; // #1422 — the first break (the minimum) stays exact, as #1198 kept it
  // TASKS.csv #1430 (review #1352, Silvertip) — a break equal to the one before makes an empty class: Quantile on a recovered
  // susceptibility with most cells at the 0 bound gave 'to 0 | to 0 | to 5.66e-9 ...'. Equal breaks are merged; the editors say when
  // fewer classes came out than were asked for (classCountNote).
  return r.filter((v, i) => i === 0 || v > r[i - 1]);
}
// #1430 — the line an editor shows under Apply when the data could not hold `asked` distinct classes; "" otherwise
export function classCountNote(breaks, asked, method) {
  const want = Math.max(2, Math.min(64, Math.round(asked) || 5));
  if (!breaks?.length || breaks.length >= want) return "";
  return method === "quantile"
    ? tr("{k} of the {n} classes: many values are equal, so some quantiles fell on the same value and were merged.", { k: breaks.length, n: want })
    : tr("{k} of the {n} classes: some class limits fell on the same value and were merged.", { k: breaks.length, n: want });
}
function classifyBreaksRaw(values, n, method) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return [];
  // User report: "I tried adding 30 but it didn't work" — this used to silently clamp to 20 with zero
  // feedback (the class-count number input's HTML max=20 doesn't actually block typing a bigger number
  // in Chrome, so 30 got typed, then silently dropped to 20 stops right here with nothing telling the
  // user that happened). Raised the ceiling to 64 (comfortably past any real classification a geophysics
  // legend would use) — GeophysicsModule's input max attribute was raised to match.
  const count = Math.max(2, Math.min(64, Math.round(n) || 5));
  const min = nums[0], max = nums[nums.length - 1];
  if (method === "lognormal" && !(min > 0)) method = "normal"; // #1594 — a zero or negative value has no logarithm
  const breaks = [];
  if (method === "quantile") {
    for (let i = 0; i < count; i++) breaks.push(nums[Math.floor((i / count) * (nums.length - 1))]);
  } else if (method === "log" && min > 0) {
    // Geometric spacing — only meaningful for strictly positive data (chargeability/resistivity/IP
    // always are; log of zero or a negative value is undefined).
    const logMin = Math.log(min), logMax = Math.log(max);
    for (let i = 0; i < count; i++) breaks.push(Math.exp(logMin + (i / count) * (logMax - logMin)));
  } else if (method === "log" && max > 0) {
    // TASKS.csv #1397 (review #1352, Silvertip) — zeros or negatives (915 zero mag-susc readings) made "log" fall through to equal
    // intervals (0 / 20 / 40 ...) in silence. They now take the lowest class; the others are spaced geometrically from the
    // smallest positive value.
    const pos = nums.find((v) => v > 0), logMin = Math.log(pos), logMax = Math.log(max);
    breaks.push(min);
    for (let i = 0; i < count - 1; i++) breaks.push(Math.exp(logMin + (i / (count - 1)) * (logMax - logMin)));
  } else if (method === "normal") {
    // Fit the data's own mean/stddev, space breaks evenly in cumulative-probability space, map back
    // to raw values via mean + z*std — concentrates more class boundaries near the mean, where real
    // survey data usually clusters, instead of spreading them uniformly like "equal" does.
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    const std = Math.sqrt(variance) || 1;
    for (let i = 0; i < count; i++) {
      const p = (i / count) * 0.9998 + 0.0001; // keep strictly inside (0,1) — probit(0)/(1) is +/-Infinity
      const z = probit(p);
      breaks.push(Math.min(max, Math.max(min, mean + z * std)));
    }
    breaks.sort((a, b) => a - b); // clamping can bunch extreme classes together; callers assume ascending order
  } else if (method === "lognormal" && min > 0) {
    // TASKS.csv #1594 — the normal method on the logarithm, for a strictly positive, skewed property (an MVI amplitude, a resistivity,
    // a grade): on Lawyers' MVI the normal breaks clipped to the minimum and merged
    const logs = nums.map(Math.log), mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    const std = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length) || 1;
    for (let i = 0; i < count; i++) breaks.push(Math.min(max, Math.max(min, Math.exp(mean + probit((i / count) * 0.9998 + 0.0001) * std))));
    breaks[0] = min;
    breaks.sort((a, b) => a - b);
  } else if (method === "jenks") {
    // TASKS.csv #291 (QGIS-specialist review) — true Fisher-Jenks natural breaks. The four methods
    // above were modelled on Oasis montaj's classification menu (see this function's own header
    // comment), which is why QGIS's single most-used choropleth method was missing: natural breaks
    // finds the class boundaries that MINIMIZE within-class variance, which is what you want for the
    // irregularly clustered data assay and geophysics values actually are (a background population
    // plus a long anomalous tail). Equal-interval puts nearly every sample in class 1 there, and
    // quantile splits the background into meaningless slices while lumping the whole anomaly together.
    // TASKS.csv #1198 — readable breaks, and no last "class" that starts at the maximum: 16-digit stops, and a fifth class holding one value
    // #1422 — the rounding now happens in classifyBreaks for every method
    return jenksBreaks(nums, count).filter((b, i) => i === 0 || b < nums[nums.length - 1]);
  } else {
    for (let i = 0; i < count; i++) breaks.push(min + (i / count) * (max - min));
  }
  return breaks;
}

// Fisher-Jenks is O(classes × n²) in both time and memory, which is fine for a few hundred samples and
// completely unusable at the scale this app actually classifies (a voxel/block model is routinely
// hundreds of thousands of cells; TASKS.csv's standing "performance is priority #1"). So the data is
// evenly SUBSAMPLED in sorted order first, with the budget solved from the class count rather than
// fixed: sample = sqrt(JENKS_BUDGET / classes), i.e. ~2000 samples for 5 classes down to ~560 for 64,
// keeping every run in the same tens-of-milliseconds range no matter how it's configured. Subsampling
// a SORTED array preserves the distribution's shape (it's a quantile sample), which is all the
// variance minimization actually reads — and the true min/max are always kept as the first/last
// samples so no class boundary can fall outside the real data range.
const JENKS_BUDGET = 2e7;
function jenksBreaks(sorted, nClasses) {
  const min = sorted[0], max = sorted[sorted.length - 1];
  if (max <= min) return new Array(nClasses).fill(min);
  const budget = Math.max(2, Math.floor(Math.sqrt(JENKS_BUDGET / nClasses)));
  let data = sorted;
  if (sorted.length > budget) {
    data = new Array(budget);
    for (let i = 0; i < budget; i++) data[i] = sorted[Math.round((i / (budget - 1)) * (sorted.length - 1))];
  }
  const n = data.length;
  if (n <= nClasses) return data.slice(0, nClasses).concat(new Array(Math.max(0, nClasses - n)).fill(max)).slice(0, nClasses);

  // Standard Fisher-Jenks dynamic program: limits[l][j] = index (1-based) where class j starts, for
  // the optimal j-class partition of the first l values; vars[l][j] = that partition's total
  // within-class variance. Flat typed arrays rather than nested JS arrays — same math, far less GC
  // pressure at the sizes above.
  const w = nClasses + 1;
  const limits = new Int32Array((n + 1) * w);
  const vars = new Float64Array((n + 1) * w);
  for (let i = 1; i <= nClasses; i++) {
    limits[1 * w + i] = 1;
    for (let j = 2; j <= n; j++) vars[j * w + i] = Infinity;
  }
  let variance = 0;
  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSq = 0, count = 0;
    variance = 0;
    for (let m = 1; m <= l; m++) {
      const lower = l - m + 1;
      const val = data[lower - 1];
      count++;
      sum += val; sumSq += val * val;
      variance = sumSq - (sum * sum) / count;
      const prev = lower - 1;
      if (prev !== 0) {
        for (let j = 2; j <= nClasses; j++) {
          const cand = variance + vars[prev * w + (j - 1)];
          if (vars[l * w + j] >= cand) { limits[l * w + j] = lower; vars[l * w + j] = cand; }
        }
      }
    }
    limits[l * w + 1] = 1;
    vars[l * w + 1] = variance;
  }

  // Walk the table back to the class boundaries. `out` is the LOWER bound of each class (out[0] is
  // always the data minimum), matching what every other branch of classifyBreaks returns.
  const out = new Array(nClasses);
  out[0] = data[0];
  let k = n;
  for (let j = nClasses; j > 1; j--) {
    const idx = limits[k * w + j];
    out[j - 1] = data[Math.max(0, idx - 1)];
    k = Math.max(1, idx - 1);
  }
  return out;
}

export const LAYER_META = {
  litho:    { label: "Lithology",      kind: "interval", radius: 2.2, opacity: 1,    colorFn: colorForLithology, nameFn: (u) => lithoMeaning(u) || UNIT_NAMES[u] || u /* #3735: this project's own meaning first */, numeric: false },
  alt:      { label: "Alteration",     kind: "interval", radius: 3.4, opacity: 0.4,  colorFn: colorForAlteration, numeric: false },
  vein:     { label: "Veins",          kind: "interval", radius: 1.0, opacity: 0.9,  colorFn: colorForVein, numeric: false },
  breccia:  { label: "Breccia",        kind: "interval", radius: 1.6, opacity: 0.85, colorFn: colorForBreccia, numeric: false }, // TASKS.csv #608
  weath:    { label: "Weathering",     kind: "interval", radius: 3.0, opacity: 0.5,  colorFn: colorForWeathering, numeric: false }, // TASKS.csv #2162 — weathering / oxidation / regolith
  geotech:  { label: "Geotech (RQD%)", kind: "interval", radius: 4.6, opacity: 0.35, colorFn: null, numeric: true },
  // TASKS.csv #137 — Micromine-specialist audit finding: recovery% and SG are routinely logged as
  // intervals feeding tonnage/density calculations for resource estimates, alongside RQD/lithology —
  // same "interval" kind/rendering as geotech above, just a different numeric field.
  recovery: { label: "Recovery %", kind: "interval", radius: 4.2, opacity: 0.35, colorFn: null, numeric: true },
  // TASKS.csv #3529 — unit / purpose: this layer IS the density the tonnes use (Grade-tonnage, solid tonnages), in t/m³ (= g/cc); said in the import notice, the legend, Identify and the layer's panel
  sg:       { label: "Specific gravity", kind: "interval", radius: 3.8, opacity: 0.35, colorFn: null, numeric: true, unit: "t/m³", purpose: "The project's density (t/m³): the Grade-tonnage dialog and the tonnages of solids take their tonnes from this layer." },
  mnlgy:    { label: "Mineralization", kind: "point",    colorFn: colorForMineral, numeric: false },
  magsusc:  { label: "Mag. susc.",     kind: "point",    colorFn: null, numeric: true },
  structure:{ label: "Structure planes", kind: "plane",  colorFn: colorForStructure, numeric: false },
  structzone: { label: "Structural zones", kind: "interval", radius: 2.0, opacity: 0.8, colorFn: colorForStructZone, numeric: false }, // TASKS.csv #604
  litho_gc: { label: "Lithology (geochem)", kind: "interval", radius: 2.6, opacity: 0.85, colorFn: colorForLithology, numeric: false },
  alt_gc:   { label: "Alteration (geochem)", kind: "interval", radius: 3.8, opacity: 0.4, colorFn: colorForAlteration, numeric: false },
  // TASKS.csv #25 — raw x/y/z geophysics point clouds (mag, IP, gravity, whatever), imported via the
  // Geophysics module (its own dedicated CSV parser, not the hole-relative ImportMappingModal — these
  // rows have no hole_id/depth to desurvey against). "point3d" distinguishes this from the existing
  // "point" kind (mnlgy/magsusc), which is hole_id+depth based and gets positioned by desurveying a
  // trace; point3d rows carry their own absolute world x/y/z and are rendered once, independent of
  // any hole, in ViewerModule's geometry-rebuild effect.
  geophys_pts: { label: "Geophysics points", kind: "point3d", colorFn: null, numeric: true },
};

export function distinctValues(rows) {
  const counts = new Map();
  rows.forEach((r) => { const k = String(r.value); counts.set(k, (counts.get(k) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}


// TASKS.csv #430 — does an "overturned / younging / polarity" cell mark the pick as overturned? Only clear
// yes-values count; anything else (blank, "N", "up", "1", "normal") is the ordinary right-way-up case.
const OVERTURNED_VALUES = new Set(["y", "yes", "true", "overturned", "ot", "o/t", "inverted", "-1", "down", "facing down", "younging down"]);
export function isOverturnedValue(v) {
  return v != null && OVERTURNED_VALUES.has(String(v).trim().toLowerCase());
}

// TASKS.csv #1289 — what a category is drawn and called, given its override { color, label } and its layer's LAYER_META entry. One copy, for the view, the legend, the inspector and the style export.
export function categoryColor(override, meta, value) { return override?.color || meta.colorFn(value); }
export function categoryLabel(override, meta, value) { return override?.label || (meta.nameFn ? meta.nameFn(value) || value : value); }

// TASKS.csv #2052 (review #2013, 3D Modelling) — a litho group's role came from its NAME in Modelling codes (a group called 'Intrusive' was
// cross-cutting by the #1541 word rule) and from its MEMBERS in the stack and the implicit picker: the three disagreed. One rule now, from
// the members: the role they all share; cross-cutting if any of them cross-cuts (the stack's rail); else stratigraphic. A name that is not
// a group keeps the code rule. groupMcodeRole(name, groups) -> a Modelling codes role; groupNameHint(g) -> the role the name alone suggests
// when it differs (shown as a suggestion, never applied).
export function groupMemberRole(g) {
  const roles = (g?.codes || []).map(roleForLithology);
  if (!roles.length) return "stratigraphic";
  if (new Set(roles).size === 1) return mcodeRoleOf(roles[0]);
  return roles.some(isCrossCuttingRole) ? "cross-cutting" : "stratigraphic";
}
export function groupMcodeRole(name, groups) {
  const g = (groups || []).find((x) => x?.name === name);
  return g ? groupMemberRole(g) : mcodeRoleOf(roleForLithology(name));
}
export function groupNameHint(g) {
  const byName = mcodeRoleOf(roleForLithology(g?.name));
  return byName !== groupMemberRole(g) ? byName : null;
}
