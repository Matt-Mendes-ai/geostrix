// ============================================================
// Layer metadata, colors, and generic CSV import mapping helpers
// ============================================================
import { rowKey } from "./modellingCodes.js"; // TASKS.csv #2533 — the vein sources read the modelling codes' assign map
import { voxelStretch } from "./voxelStretch.js"; // TASKS.csv #1812
import { looksLikeLogTable, zeroLengthRows } from "./downholeLogChannels.js"; // TASKS.csv #2160; zeroLengthRows: #2884
import { looksLikeEventTable } from "./downholeEvents.js"; // TASKS.csv #2317
import { guessStructureColumns } from "./mapLayers.js"; // TASKS.csv #426
import { gridCoordinateColumns, gridElevation } from "./gridColumns.js"; // TASKS.csv #2151, moved: #2564
import { isElementColumn } from "./geochemColumns.js"; // TASKS.csv #2150; #3159: geochemColumns, not geochem.js (the whole geochem library in startup)
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
  [/\b(lost core|core loss|no (core )?recovery|tricone|pre-?collar|casing|shotcrete|cement|not present|thrown out)\b/, "no recovery"], // shotcrete…: #2227
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
  const lastKey = { raw: undefined, key: "" }; // logs run code by code: reuse the last key while the raw value repeats
  for (const r of rows || []) {
    if (!r || r.value == null) continue;
    if (r.value !== lastKey.raw) { lastKey.raw = r.value; lastKey.key = String(r.value).trim().toLowerCase(); }
    if (by.get(lastKey.key)?.noted >= NOTE_SAMPLE) continue;
    let text = "";
    for (const [k, v] of Object.entries(r)) if (!NOT_NOTES.has(k) && typeof v === "string" && v.length > 3) text += " " + v;
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
  return out;
}
let noteRoles = null;
export function setLithologyNoteRoles(map) { noteRoles = map && map.size ? map : null; }
// TASKS.csv #2537 — the role came from the default ('stratigraphic' for a code nothing recognises), not from a rule: the pane marks it
export function roleIsAssumed(u) {
  const k = String(u || "").trim().toLowerCase();
  return k !== "unknown" && !UNIT_ROLES[k] && !ROLE_PATTERNS.some(([re]) => re.test(k)) && !noteRoles?.get(k);
}
export function roleForLithology(u) {
  const k = String(u || "").trim().toLowerCase();
  if (k === "unknown") return "no recovery"; // TASKS.csv #2227 — the label blank cells import as (#2182) is not logged rock: never a unit, never a role from notes
  return UNIT_ROLES[k] || ROLE_PATTERNS.find(([re]) => re.test(k))?.[1] || noteRoles?.get(k) || "stratigraphic";
}
// Cross-cutting = doesn't belong in an ordered, non-crossing stratigraphic pile (see the Stack tool's
// own scope comment in ViewerModule.jsx) — faults, dykes, breccia bodies and veins (#1369) all qualify.
// TASKS.csv #2226 (review #2174, WA lode gold) — the Vein / dyke tool listed only the Veins log: a company that logs its veins as lithology codes
// (VQZ 207, VCB 227 intervals) had an empty list and no word why. Its codes: the Veins log's, then the lithology codes that are cross-cutting
// (the Modelling codes role, else the suggestion from the name or the notes), as 'litho:<code>'.
// #2175 — ViewerModule calls this on every render: the distinct codes of a rows array are kept until the array changes (a 1.5 M-row log was
// scanned again on each render)
const DISTINCT_CODES = new WeakMap();
export function veinSourceUnits(layers, modellingCodes = null) {
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
  return [...seen(layers?.vein), ...seen(litho).filter((v) => crossCutting(v) && rawKept(v)).map((v) => `litho:${v}`), ...mcodes];
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

export const MIN_COLORS = { ACA: "#c8c8d8", CPY: "#d4af37", GAL: "#6a6a78", PO: "#8a6a45", PY: "#d4c060", SPH: "#6a3a2a" };
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
    if (discrete) {
      let rgb = sorted[0].rgb;
      for (const s of sorted) { if (value >= s.value) rgb = s.rgb; else break; }
      return rgb;
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
  litho:    { label: "Lithology",      kind: "interval", radius: 2.2, opacity: 1,    colorFn: colorForLithology, nameFn: (u) => UNIT_NAMES[u] || u, numeric: false },
  alt:      { label: "Alteration",     kind: "interval", radius: 3.4, opacity: 0.4,  colorFn: colorForAlteration, numeric: false },
  vein:     { label: "Veins",          kind: "interval", radius: 1.0, opacity: 0.9,  colorFn: colorForVein, numeric: false },
  breccia:  { label: "Breccia",        kind: "interval", radius: 1.6, opacity: 0.85, colorFn: colorForBreccia, numeric: false }, // TASKS.csv #608
  weath:    { label: "Weathering",     kind: "interval", radius: 3.0, opacity: 0.5,  colorFn: colorForWeathering, numeric: false }, // TASKS.csv #2162 — weathering / oxidation / regolith
  geotech:  { label: "Geotech (RQD%)", kind: "interval", radius: 4.6, opacity: 0.35, colorFn: null, numeric: true },
  // TASKS.csv #137 — Micromine-specialist audit finding: recovery% and SG are routinely logged as
  // intervals feeding tonnage/density calculations for resource estimates, alongside RQD/lithology —
  // same "interval" kind/rendering as geotech above, just a different numeric field.
  recovery: { label: "Recovery %", kind: "interval", radius: 4.2, opacity: 0.35, colorFn: null, numeric: true },
  sg:       { label: "Specific gravity", kind: "interval", radius: 3.8, opacity: 0.35, colorFn: null, numeric: true },
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

// ============================================================
// generic CSV import: target schemas + column-mapping helpers
// ============================================================
// TASKS.csv #2149 (WA drillhole database review #2148) — mTo is the commonest unmatched column in WAMEX (14,164 files) and
// DMIRS's own harmonized pair is FromDepth / ToDepth: "to" is too short for the substring pass, so every such interval table
// opened with To empty and Import disabled. One list for the interval schemas, the custom layer and the assay dialog.
export const INTERVAL_FROM_ALIASES = ["from", "from_m", "depth_from", "from_depth", "fromdepth", "depthfrom", "mfrom", "m_from", "dfrom", "geolfrom", "sampfrom", "geol_from", "samp_from", "interval_from", "start_depth", "startdepth", "depth_start"];
export const INTERVAL_TO_ALIASES = ["to", "to_m", "depth_to", "to_depth", "todepth", "depthto", "mto", "m_to", "dto", "geolto", "sampto", "geol_to", "samp_to", "interval_to", "end_depth", "enddepth", "depth_end"];
function intervalFields(valueAliases, extraAliases, numeric, descriptionAliases) {
  const fields = [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "from", label: "From", required: true, aliases: INTERVAL_FROM_ALIASES },
    { key: "to", label: "To", required: true, aliases: INTERVAL_TO_ALIASES },
    // TASKS.csv #320 — "value"/"val" as LAST-resort aliases: a hand-built hole_id,from,to,value file left
    // Value unmapped. Appended, so every layer's own names (litho, rock_type...) still win.
    { key: "value", label: numeric ? "Value (numeric)" : "Value", required: true, aliases: [...valueAliases, ...["value", "val"].filter((a) => !valueAliases.includes(a))] },
  ];
  if (extraAliases) fields.push({ key: "extra", label: "Extra (optional, e.g. %)", required: false, aliases: extraAliases });
  // TASKS.csv #208 — real source data (esp. lithology logs) very often carries a free-text
  // description/comments column alongside the coded value ("Pale green. Consistent fine grain.");
  // previously unmappable and silently dropped on import.
  if (descriptionAliases) fields.push({ key: "description", label: "Description (optional)", required: false, aliases: descriptionAliases });
  return fields;
}

// TASKS.csv #205 — name-guess aliases for an optional per-row source-CRS column (e.g. a merged
// regional DB export where different collars were surveyed in different UTM zones), matched the
// same way guessColumn already resolves hole_id/x/y/z against real-world header variants.
export const EPSG_COL_ALIASES = ["epsg_srid", "source_epsg", "epsg", "srid", "crs_epsg", "crs"];

export const TARGET_SCHEMAS = {
  collars: { label: "Collars", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no", "hole_name"] },
    { key: "x", label: "Easting (X)", required: true, aliases: ["x", "easting", "east", "utm_e", "utme"] },
    { key: "y", label: "Northing (Y)", required: true, aliases: ["y", "northing", "north", "utm_n", "utmn"] },
    { key: "z", label: "Elevation (Z)", required: true, aliases: ["z", "elevation", "elev", "rl", "utm_z"] },
    { key: "azimuth", label: "Azimuth (for straight holes w/ no survey)", required: false, aliases: ["azimuth", "azim_grid", "azi", "az", "brg", "bearing", "collar_az", "hole_az"] }, // collar_az / hole_az: #1655 (acQuire's Collar_Az_D; 'az' alone matches a whole header only) // az / brg / bearing: #546; azim_grid: GeoStrix's own collar export (#577) — exact, so it beats azim_true
    { key: "dip", label: "Dip (for straight holes w/ no survey)", required: false, aliases: ["dip", "inclination", "incl"] }, // #605: inclination (MX-style collar sheets)
    { key: "length", label: "Hole length (optional)", required: false, aliases: ["length", "total_depth", "eoh", "max_depth", "hole_length", "actual depth", "actual_depth", "final_depth", "final depth", "td", "depth"] }, // td: #2151 (WAMEX); #600: "Actual depth" before a planned "Target depth"
  ], dipConvention: true },
  survey: { label: "Survey", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "depth", label: "Depth", required: true, aliases: ["depth", "at", "md", "station", "dist", "distance"] }, // dist: #1105 (Micromine HOLEID, DIST, AZIMUTH, DIP)
    { key: "azimuth", label: "Azimuth", required: true, aliases: ["azimuth", "azi", "az", "azim", "brg", "bearing"] }, // brg / bearing: Datamine (#546)
    { key: "dip", label: "Dip", required: true, aliases: ["dip", "inclination", "incl"] },
  ], dipConvention: true },
  // TASKS.csv #600 — Lith_Code / Lith1_Code / Rock_Code before the generic "unit": a real ARIS export has
  // Lith_Code (filled) beside Lith_Group_Unit (blank on every row), and "unit" picked the blank one.
  litho: { label: "Lithology", fields: intervalFields(["lithology", "lith_code", "lith1_code", "lith1_gf_code", "lithcode", "lithology1", "lith1", "rock1", "geol_rock1", "maj_lithcode", "major_lithcode", /* #2153 */ "rock_code", "rock_type", "rocktype", "litho", "lith", "rock", "unit", "litho_unit"], null, false, ["description", "comments", "comment", "notes", "desc", "lith_desc", "lith1_local_comments"]) },
  // TASKS.csv #600 — the column names real logging exports use (acQuire / MX Deposit, seen in BC ARIS reports):
  // numbered primary columns (Alt1_Code, Min1_Code / Min_Code1, Vein1_Comp / Vein_Type1, MagSus1, Ave_Reading,
  // BulkDens_Calc, SG_D). Listed FIRST so the primary (1st) column wins over a later one.
  alt: { label: "Alteration", fields: [
    ...intervalFields(["alt1_code", "alt_code", "alt_assemblage", "alt_rx_min1_type", "alt_min1_type", "alt_min_1_type", "alt1_mineral", "alt_mineral", "alt1_min", "altn1", "alt1_style", "alt2_code", "assemblage", "assemb", "alteration"]), // alt_rx_min1_type: #1345 (acQuire); alt1_mineral…: #2153 / #2184 (WAMEX); assemb: #3204 (AL_HIGHT_ASSEMB / AL_LOWT_ASSEMB, the first one)
    // TASKS.csv #1511 — intensity as logged (text: "3", "W", "strong"), as structural zones keep it (#604)
    { key: "intensity", label: "Intensity (optional)", required: false, aliases: ["alt1_intensity", "alt_intensity", "alt1_int", "alt_int", "alteration_intensity", "intensity"] },
  ] },
  vein: { label: "Veins", fields: intervalFields(["vein1_comp", "vein_type1", "vein1_type", "vein_comp", "vein1_code", "vein_code", "vein2_code", "veins", "assemblage", "type", "vein_type", "type_code"]) }, // type_code: 40958Z "Vein type"; vein1_code / veins: #2153
  // TASKS.csv #2162 — WA weathering (5,096 files), oxidation (2,237) and regolith (3,217) logs: one layer, whichever word the file uses
  weath: { label: "Weathering", fields: intervalFields(["weathering", "weath", "weath_code", "weathering_code", "weath1", "weath_code1", "oxidation", "oxid", "oxidation_state", "ox_state", "oxide_zone", "redox", "regolith", "regol", "regolith_code", "regolith_unit", "reg_code"], null, false, ["description", "comments", "comment", "notes", "desc"]) },
  breccia: { label: "Breccia", fields: intervalFields(["breccia_type", "brecc_type", "brx_type", "bx_type", "bx_class", "breccia", "assemblage", "genesis", "type"]) }, // TASKS.csv #608; bx_class: #1345
  // TASKS.csv #604 — structure logged as zones (from / to + code + intensity + alpha), Matt 2026-10-21: "keep it as
  // intervals, as a layer of structural zones". Intensity stays text (Copley "4", Woodjam "M"); alpha is the zone's
  // representative core angle when logged, kept but not turned into a plane (one angle for a whole zone is not a pick).
  structzone: { label: "Structural zones", fields: [
    ...intervalFields(["struc_code", "struct_code", "structure_code", "structure_type", "struc_type", "struct_type", "zone_type", "structure", "struct", "type"], null, false, ["struc_desc", "struct_desc", "structure_desc", "comments", "comment", "description", "desc", "notes"]),
    { key: "intensity", label: "Intensity (optional)", required: false, aliases: ["struc_intensity", "struct_intensity", "structure_intensity", "structure_int", "intensity"] },
    { key: "alpha", label: "Alpha (core angle, optional)", required: false, aliases: ["struc_alpha", "struct_alpha", "structure_alpha", "alpha", "alpha_deg"] },
  ] },
  mnlgy: { label: "Mineralization", fields: intervalFields(["min1_code", "min_code1", "min_code", "min_mnlgy", "sul_min_1", "sulph_min_1", "mineral"], ["min1_pct", "min_pct1", "min_int_pct", "sul_min_1_pct", "percent", "pct"]) }, // sul_min_1: #1345 (acQuire sulphide log)
  geotech: { label: "Geotech (numeric)", fields: intervalFields(["rqd_pct", "rqd_pct_d", "rqq_pct_d", "rqd", "value"], null, true) }, // #1345: the percent column before REC_RQD_M (metres)
  recovery: { label: "Recovery % (numeric)", fields: intervalFields(["recovery_pct", "recovery", "rec_pct", "rec_pct_d", "core_recovery", "value"], null, true) },
  sg: { label: "Specific gravity (numeric)", fields: intervalFields(["sg", "sg_d", "bulkdens_calc", "sg_calc", "calc_sg" /* #3204: CALC-SG */, "specific_gravity", "specific_grav", "bulk_density", "density", "reading", "value"], null, true) }, // reading: #2153 (beside Weight_Wet / Weight_Dry)
  // TASKS.csv #605 — mag sus is often logged as POINT readings (depth + value, an MX-style "Mag Susc" sheet), so a
  // Depth column is an alternative to From / To (oneOf below; the reading is placed at that depth).
  magsusc: { label: "Mag. susceptibility (numeric)", oneOf: [["from", "to"], ["depth"]], fields: [
    ...intervalFields(["mag_avg_si", "ave_reading", "avg_reading", "mag_reading", "ms_reading" /* #3204 */, "magsus1", "magsus", "mag_si", "mag_sus", "mag_avg", "mag", "value"], null, true) // mag_reading: #1345
      .map((f) => (f.key === "from" || f.key === "to" ? { ...f, required: false, label: `${f.label} (or Depth below)` } : f)),
    { key: "depth", label: "Depth (point readings, instead of From / To)", required: false, aliases: ["depth", "depth_m", "md", "at"] },
  ] },
  structure: { label: "Structure planes", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "depth", label: "Depth", required: true, aliases: ["depth_m", "depth", "at", "md", "geolfrom", "from"] }, // geolfrom / from: #1345 (acQuire point table, GEOLFROM = GEOLTO)
    { key: "value", label: "Structure type", required: true, aliases: ["structure_type", "stpt_feature", "type", "struct", "structure"] },
    { key: "dip", label: "Dip (optional)", required: false, aliases: ["inferred_dip_deg", "dip"] },
    { key: "azimuth", label: "Dip direction / dip azimuth (optional)", required: false, aliases: ["assumed_dip_azimuth", "dip_azimuth", "dip_direction", "dipdirection", "dip_dir", "dipdir", "ddir", "dd", "azimuth"] },
    // TASKS.csv #426 — strike (right-hand rule) is converted to dip direction = strike + 90 when there is
    // no dip-direction column; it used to be silently ignored.
    { key: "strike", label: "Strike, right-hand rule (optional — used when no dip direction)", required: false, aliases: ["strike", "strike_rhr"] },
    // TASKS.csv #427 — oriented-core logging: alpha/beta are converted to dip / dip direction on import
    // using the hole's survey (when the file has no dip/dip-direction of its own); alpha alone is kept.
    { key: "alpha", label: "Alpha (core angle, optional)", required: false, aliases: ["alpha", "alpha_deg", "alpha_angle"] },
    { key: "beta", label: "Beta (optional, clockwise looking down-hole)", required: false, aliases: ["beta", "beta_deg", "beta_angle"] },
    // TASKS.csv #362 — which individual structure a pick belongs to (e.g. "Main Fault", "F2"). Without it,
    // every pick of one type (all 'FLT') is modelled as ONE surface even when they are several faults.
    { key: "structure_id", label: "Structure name / ID (optional — which fault/vein)", required: false, aliases: ["structure_id", "structure_name", "struct_id", "fault_id", "fault_name", "vein_id"] },
    // TASKS.csv #430 — overturned bedding: the implicit model is told the younging side is the other way
    // (GemPy orientation polarity -1). Y / overturned / -1 / down mark a pick as overturned.
    { key: "overturned", label: "Overturned / younging (optional — Y, overturned, -1 or down = overturned)", required: false, aliases: ["overturned", "younging", "facing", "polarity", "way_up"] },
  ] },
  custom: { label: "Custom layer", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "from", label: "From (leave unset if point data)", required: false, aliases: INTERVAL_FROM_ALIASES },
    { key: "to", label: "To (leave unset if point data)", required: false, aliases: INTERVAL_TO_ALIASES },
    { key: "depth", label: "Depth (for point data)", required: false, aliases: ["depth", "at", "md", "event_depth", "depth_m"] }, // event_depth: #2317
    { key: "value", label: "Value / category", required: true, aliases: ["value", "label", "event_code", "eventcode", "event_type", "boundary_code", "event", "boundary"] }, // event*: #2317
  ] },
};

// TASKS.csv #335 — exact (case-insensitive) header match only, no substring pass. The multi-file drop
// uses this to decide whether a guess is safe to commit without showing the mapping dialog: a required
// field that only matched via guessColumn's substring pass ("inferred_dip_deg" contains "dip") is a
// guess the user must see.
// TASKS.csv #337 — CSV/DB cell -> number, with BLANK meaning "missing" (NaN), never 0. Papa's
// dynamicTyping turns "" into null and Number(null) === 0, so a blank collar RL used to put the collar at
// sea level, a blank survey dip made the hole horizontal and a blank RQD read as 0 %. Common no-data
// spellings count as blank too.
const NO_DATA_TEXT = new Set(["", "na", "n/a", "nan", "null", "none", "-", "--", "nd"]);
// TASKS.csv #2159 (WA drillhole review) — the numeric no-data codes of drillhole databases and LAS logs (las.js COMMON_NULLS): 101,078
// WAMEX density readings of -999 / -999.25 imported as densities, collar PCDEPTH -999, X_east -99999. Read as missing wherever num() reads
// a collar, survey or interval number. Exact values only: -998 or -1000 stay numbers.
export const NULL_SENTINELS = new Set([-999, -999.25, -9999, -99999, -999999]);
export const isNullSentinel = (v) => NULL_SENTINELS.has(typeof v === "number" ? v : Number(String(v ?? "").trim()));
export function num(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return NULL_SENTINELS.has(v) ? NaN : v;
  const s = String(v).trim();
  if (NO_DATA_TEXT.has(s.toLowerCase())) return NaN;
  const n = Number(s);
  return NULL_SENTINELS.has(n) ? NaN : n; // #2159
}

// TASKS.csv #336 — re-importing a hole's rows REPLACES that hole's existing rows instead of appending a
// second copy. Daily camp re-imports of corrected survey/logging files used to leave old and new rows
// interleaved (holes zig-zagging between two surveys, intercept metres doubled); QC only warned after
// the fact. Holes not in the new file are untouched, so building one layer from several files that
// cover DIFFERENT holes still works. Returns the merged list and which holes were replaced.
// TASKS.csv #605 — keepRows (a Set/WeakSet of row objects): rows committed earlier in the SAME drop are never
// replaced. Two files of one delivery feeding one layer (a workbook's Alteration and Breccia sheets) add up;
// before, the second wiped the first's rows for every hole they shared.
// TASKS.csv #582 — a hole-EXTENSION file (a deepening / re-entry campaign shipping only the new metres, e.g.
// 150-300 m) used to wipe the hole's 0-150 m logging and its upper survey stations. Per hole now: when everything
// incoming lies at or below the deepest existing row (touching allowed), the rows are APPENDED (appendedHoles);
// only overlapping depth ranges replace. Rows without depths (from / to / depth) keep the #336 replace rule. For
// point rows (survey stations, structure picks) a station repeated at exactly the join depth is not doubled: the
// incoming one wins.
const rowTop = (r) => (Number.isFinite(r.from) ? r.from : Number.isFinite(r.depth) ? r.depth : NaN);
const rowBottom = (r) => (Number.isFinite(r.to) ? r.to : Number.isFinite(r.depth) ? r.depth : NaN);
// TASKS.csv #2799 — opts.identical false: only the rows (a state setter after the notice's own call): the identical-hole check is most of the
// cost (0.29 s of 0.35 s for 430 holes x 50 rows) and the import ran it two or three times per file
export function replaceRowsByHole(prev, incoming, keepRows = null, { identical = true } = {}) {
  const incomingHoles = new Set(incoming.map((r) => r.hole_id));
  const inTop = new Map();
  incoming.forEach((r) => { const t = rowTop(r); if (Number.isFinite(t)) inTop.set(r.hole_id, Math.min(inTop.get(r.hole_id) ?? Infinity, t)); });
  const oldBottom = new Map(), oldUndated = new Set();
  (prev || []).forEach((r) => {
    if (!incomingHoles.has(r.hole_id) || keepRows?.has(r)) return;
    const b = rowBottom(r);
    if (Number.isFinite(b)) oldBottom.set(r.hole_id, Math.max(oldBottom.get(r.hole_id) ?? -Infinity, b)); else oldUndated.add(r.hole_id);
  });
  const appendHole = (h) => inTop.has(h) && oldBottom.has(h) && !oldUndated.has(h) && inTop.get(h) >= oldBottom.get(h) - 1e-6;
  const replacedHoles = new Set(), appendedHoles = new Set();
  const kept = [];
  (prev || []).forEach((r) => {
    if (!incomingHoles.has(r.hole_id) || keepRows?.has(r)) { kept.push(r); return; }
    if (appendHole(r.hole_id)) {
      appendedHoles.add(r.hole_id);
      // a point row at exactly the join depth is the same station / pick: the incoming one replaces it
      if (!Number.isFinite(r.from) && Number.isFinite(r.depth) && Math.abs(r.depth - inTop.get(r.hole_id)) < 1e-6) return;
      kept.push(r);
      return;
    }
    replacedHoles.add(r.hole_id);
  });
  // TASKS.csv #2191 (review #2174) — a byte-identical re-import was told as 'replaced 216 holes' and 'extended 16': a hole whose rows equal the
  // ones it had (every field but the internal _ ones) is reported as identical, neither replaced nor extended
  if (!identical) return { rows: [...kept, ...incoming], replacedHoles: [...replacedHoles], appendedHoles: [...appendedHoles], identicalHoles: [] }; // #2799
  // #2799 — the check compares values, not strings: each hole's old and new rows (only holes with as many rows as before can be identical)
  // sorted by depth and compared field by field; a hole with two rows at the same depth falls back to the signature compare (as before)
  const keyCache = new Map();
  const keysOf = (r) => { const raw = Object.keys(r), id = raw.join("\u0002"); let e = keyCache.get(id); if (!e) { const ks = raw.filter((k) => !k.startsWith("_")).sort(); e = { ks, id: ks.join("\u0002") }; keyCache.set(id, e); } return e; };
  const sig = (r) => { const e = keysOf(r); return e.id + "\u0003" + JSON.stringify(e.ks.map((k) => r[k])); };
  const sameVal = (x, y) => x === y || (Number.isNaN(x) && Number.isNaN(y)) || (x && y && typeof x === "object" && typeof y === "object" && JSON.stringify(x) === JSON.stringify(y));
  const sameRow = (a, b) => { const ea = keysOf(a), eb = keysOf(b); if (ea.id !== eb.id) return false; for (const k of ea.ks) if (!sameVal(a[k], b[k])) return false; return true; };
  const depthKey = (r) => { const t = rowTop(r), b = rowBottom(r); return [Number.isFinite(t) ? t : -Infinity, Number.isFinite(b) ? b : -Infinity]; };
  const group = (rows, keep) => { const m = new Map(); for (const r of rows) { if (!keep.has(r.hole_id)) continue; (m.get(r.hole_id) || m.set(r.hole_id, []).get(r.hole_id)).push(r); } return m; };
  const count = (rows) => { const m = new Map(); for (const r of rows) m.set(r.hole_id, (m.get(r.hole_id) || 0) + 1); return m; };
  const oldRows = (prev || []).filter((r) => incomingHoles.has(r.hole_id) && !keepRows?.has(r)), oldN = count(oldRows), newN = count(incoming);
  const maybe = new Set([...replacedHoles, ...appendedHoles].filter((h) => oldN.get(h) && oldN.get(h) === newN.get(h)));
  const oldBy = group(oldRows, maybe), newBy = group(incoming, maybe);
  const sorted = (rows) => { const d = rows.map((r) => [depthKey(r), r]); d.sort((p, q) => p[0][0] - q[0][0] || p[0][1] - q[0][1]); let tie = false; for (let k = 1; k < d.length; k++) if (d[k][0][0] === d[k - 1][0][0] && d[k][0][1] === d[k - 1][0][1]) { tie = true; break; } return { rows: d.map((x) => x[1]), tie }; };
  const identicalHole = (h) => {
    const a = sorted(oldBy.get(h) || []), b = sorted(newBy.get(h) || []);
    if (a.rows.length !== b.rows.length || !a.rows.length) return false;
    if (a.tie || b.tie) return a.rows.map(sig).sort().join("\u0001") === b.rows.map(sig).sort().join("\u0001");
    for (let k = 0; k < a.rows.length; k++) if (!sameRow(a.rows[k], b.rows[k])) return false;
    return true;
  };
  const identicalHoles = [...replacedHoles, ...appendedHoles].filter((h) => maybe.has(h) && identicalHole(h));
  const same = new Set(identicalHoles);
  return { rows: [...kept, ...incoming], replacedHoles: [...replacedHoles].filter((h) => !same.has(h)), appendedHoles: [...appendedHoles].filter((h) => !same.has(h)), identicalHoles };
}
// TASKS.csv #1234 — a structure pick worked out in the app (with its calibration provenance, #429) is not "the earlier file" a new file
// replaces. Wraps the keep set replaceRowsByHole takes.
export const isDerivedPick = (r) => r?._src === "Core orientation calculator";
export const keepDerivedPicks = (keep) => ({ has: (r) => !!keep?.has(r) || isDerivedPick(r) });
const holeList = (hs) => `${hs.length} hole(s) (${hs.slice(0, 6).join(", ")}${hs.length > 6 ? ", …" : ""})`;
// the import notice's sentence about what happened to holes that were already loaded
export function replaceNote(res, what) {
  return (res.replacedHoles.length ? tr(" Replaced the earlier {what} of {v} — Ctrl+Z to undo.", { what, v: holeList(res.replacedHoles) }) : "")
    + (res.appendedHoles?.length ? tr(" Added below the existing {what} of {v} (the file starts at or below where they end, so it was read as an extension) — Ctrl+Z to undo.", { what, v: holeList(res.appendedHoles) }) : "")
    + (res.identicalHoles?.length ? tr(" The {what} of {v} was identical to the one already loaded: nothing changed there.", { what, v: holeList(res.identicalHoles) }) : ""); // #2191
}

// TASKS.csv #426 — one place that turns (target, headers) into a first-guess mapping. For structure
// tables the dip / dip-direction pair comes from mapLayers.guessStructureColumns, which knows that
// "DipDirection", "dip_dir", "DipDir" and "dd" are the DIRECTION and must not be taken as the dip:
// guessColumn's substring pass matched "dip" inside "DipDirection" first, so a HoleID,Depth,Type,
// DipDirection,Dip_deg file mapped DIP to the dip-direction column and left azimuth unmapped.
// TASKS.csv #2151 (WA review #2148) — collar coordinates named for their grid: MGA_East / MGA_North, GDA94_E / GDA94_N, AMG_E, GBMG_East,
// Nat_East, Local_E, with MGA_RL / Orig_RL. Three of six WA collar files were not collars (Veins / Custom, Import disabled) and these names
// miss x / y about 9,000 times each in the database. An east and a north column count only as a PAIR with the same prefix (so "Dip_E" or
// "Line_E" + "Station_N" never do); a one-letter suffix needs its underscore. -> [{ prefix, x, y, z }], map grids (MGA / GDA / AMG / UTM)
// first and local / mine grids last; z is the same grid's RL / elevation when the file has one.
// moved to gridColumns.js (#2564): one detector for collars, surface samples and outcrop structures
export { gridCoordinateColumns } from "./gridColumns.js";
// TASKS.csv #2152 — columns that name a hole's attribute, never its id; and columns that are not the hole's measured length / azimuth / dip
const HOLE_ID_VETO = /(length|depth|_len$|_m$|azi|dip|elev|type|status|parent|purpose|path|diam)/;
const NOT_HOLE_LENGTH = /(depth|dep)_(of|to)_|(^|_)(best|peak|top|base|bottom|intercept|basement|bedrock|regolith|oxide|fresh|transition)(_|$)/; // #2659
const NOT_MEASURED = /(comment|cmnts?|nominal|planned|plan_|design|target|(^|_)ref(_|$)|precollar|pre_collar|boco|tofr|water)/;
export function guessMapping(target, headers) {
  const schema = TARGET_SCHEMAS[target];
  const mapping = {};
  if (!schema) return mapping;
  schema.fields.forEach((f) => { mapping[f.key] = guessColumn(headers, f.aliases); });
  // TASKS.csv #1071 — "Hole_Length" / "Hole_Depth" matched "hole" in the substring pass and became the Hole ID
  // TASKS.csv #2152 (WA drillhole review) — and Hole_Type / Hole_Status / Parent_Hole_ID / Hole_Purpose / Hole_Diameter did too: the id is
  // guessed again among the other columns (HoleNo, Hole_Name), and left blank when none is left
  const reguess = (key, veto) => {
    if (!mapping[key] || !veto.test(normHeader(mapping[key]))) return;
    const f = schema.fields.find((x) => x.key === key);
    mapping[key] = f ? guessColumn(headers.filter((h) => !veto.test(normHeader(h))), f.aliases) : "";
  };
  reguess("hole_id", HOLE_ID_VETO);
  // #2152 — a planned, nominal, design or comment column, or the depth of a regolith boundary (pre-collar, BOCO, TOFR, water), is not the
  // hole's measured length, azimuth or dip ("depth" inside Precollar_Depth won the length; Nominal_Azimuth, Azimuth_Ref the azimuth)
  if (target === "collars" || target === "survey") for (const k of ["length", "azimuth", "dip", "depth"]) reguess(k, NOT_MEASURED);
  // TASKS.csv #2659 — the depth OF something (Depth_of_best_m, Depth_to_basement, Top_Depth) is not the hole's length: a per-hole table's
  // best-intercept depth became 'Hole length'
  if (target === "collars") reguess("length", NOT_HOLE_LENGTH);
  // TASKS.csv #2149 — the point-data Depth took FromDepth by substring ("depth" inside it) next to From = FromDepth: an interval table's
  // from / to column is never also its point depth
  if (mapping.depth && (mapping.depth === mapping.from || mapping.depth === mapping.to)) mapping.depth = "";
  if (target === "custom" && !mapping.value && spectralColumns(headers) >= 4) mapping.value = spectralMineralColumn(headers); // #2339 — the dominant mineral
  // TASKS.csv #2338 — a custom layer with From and To found is an interval table: Casing_Depth is not its point depth
  if (target === "custom" && mapping.from && mapping.to && mapping.depth) mapping.depth = "";
  // TASKS.csv #2151 — a collar file whose coordinates are named for their grid: the best grid pair, unless plain x / y names are there
  if (target === "collars") {
    const g = gridCoordinateColumns(headers)[0];
    const plain = (key) => guessColumnExact(headers, schema.fields.find((f) => f.key === key).aliases);
    if (g && !(plain("x") && plain("y"))) {
      mapping.x = g.x; mapping.y = g.y;
      if (!plain("z")) mapping.z = g.z || gridElevation(headers) || mapping.z;
    } else if (!mapping.z) mapping.z = gridElevation(headers);
  }
  // TASKS.csv #1345 (42807Z) — MAG_INSTRUMENT matched "mag" and the mag-sus log loaded 0 of 6,264 rows: a numeric layer's value is
  // never the instrument, the logger, a date or a comment
  // #2152 — nor a comment (Cmnts_Core_Recovery won Recovery % over Core_Rec_Pct), a nominal / planned / reference / original value, or a
  // regolith boundary depth
  const notAValue = (h) => /(instrument|device|logged|entered|_by$|date|comment|cmnts?|desc|model|serial|srm_name|photo|nominal|planned|(^|_)ref(_|$)|orig|precollar|pre_collar|boco|tofr|water)/.test(normHeader(h));
  if (schema.fields.some((f) => f.key === "value" && /numeric/.test(f.label)) && mapping.value && notAValue(mapping.value)) {
    const vf = schema.fields.find((f) => f.key === "value");
    mapping.value = guessColumn(headers.filter((h) => !notAValue(h)), vf.aliases);
  }
  if (target === "structure") {
    const g = guessStructureColumns(headers);
    // Only where the structure-aware guesser found something: sample_data's inferred_dip_deg /
    // assumed_dip_azimuth are exact schema aliases it doesn't know, and must keep their mapping.
    if (g.dip) mapping.dip = g.dip;
    if (g.dipDir) mapping.azimuth = g.dipDir;
    else if (mapping.azimuth && mapping.azimuth === mapping.dip) mapping.azimuth = "";
    if (g.strike) mapping.strike = g.strike;
    if (!mapping.value && g.type) mapping.value = g.type;
  }
  return mapping;
}

// TASKS.csv #600 (ARIS 40958Z) — a header as an alias would spell it: unit suffix dropped ("To (m)" -> "to",
// "Depth [m]" -> "depth"), spaces / dashes / slashes to "_" ("Mag Avg" -> "mag_avg"), "%" to "pct" ("RQD %" ->
// "rqd_pct"). Matching uses BOTH this and the plain lower-case header, so nothing that matched before stops
// matching. "To (m)" never matched: "to" is too short for the substring pass (#600 above) and "to (m)" is not "to".
export function normHeader(h) {
  return String(h ?? "").toLowerCase().trim()
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, "")
    .replace(/%/g, " pct ").trim()
    .replace(/[\s\-/]+/g, "_").replace(/^_+|_+$/g, "");
}
const headerForms = (headers) => headers.map((h) => [h.toLowerCase().trim(), normHeader(h)]);
export function guessColumnExact(headers, aliases) {
  const forms = headerForms(headers);
  for (const a of aliases) { const i = forms.findIndex((f) => f[0] === a || f[1] === a); if (i >= 0) return headers[i]; }
  return "";
}

// TASKS.csv #600 — the substring pass skips aliases of one or two letters: on a real ARIS collar header file
// "y" matched "Hole tYpe" and "z" matched "Hole siZe", so Northing and Elevation were mapped to those columns.
// Short aliases (x, y, z, az, dd, md, at, rl, sg...) now match a whole header only.
export function guessColumn(headers, aliases) {
  const forms = headerForms(headers);
  for (const a of aliases) { const i = forms.findIndex((f) => f[0] === a || f[1] === a); if (i >= 0) return headers[i]; }
  for (const a of aliases) { if (a.length <= 2 || WHOLE_ONLY.has(a)) continue; const i = forms.findIndex((f) => f[0].includes(a) || f[1].includes(a)); if (i >= 0) return headers[i]; }
  return "";
}
// TASKS.csv #1345 (ARIS 42807Z) — "val" matched inside "GEO_INTERVAL_D" (inter-VAL), so an acQuire alteration log was coloured by
// each interval's length. A last-resort alias that is a fragment of common words matches a whole header only.
const WHOLE_ONLY = new Set(["val", "mto", "dto", "dfrom", "event", "boundary"]); // event / boundary: #2317 (not inside "event_depth") // mto / dto / dfrom: #2149 (fragments: "comMTOtal", "oDTOp")
export function guessTarget(headers) {
  // #600 (40958Z): the normalised forms too ("Mag Avg" -> mag_avg, "Specific Gravity" -> specific_gravity)
  const lower = [...new Set(headers.flatMap((h) => [h.toLowerCase(), normHeader(h)]))];
  const has = (s) => lower.some((h) => h.includes(s));
  // Exact-column check for the short x/y/z headers real collar exports commonly use — a plain
  // substring test on single letters would false-positive on all sorts of unrelated columns.
  const hasCol = (s) => lower.some((h) => h.trim() === s);

  // Collars: some x/y/z-ish trio and nothing that marks this as interval/point data instead.
  // Bug fix: this used to require "easting" literally, or "x" together with "northing" — real
  // exports (including the app's own sample datasets) commonly just use bare x/y/z headers,
  // which that check missed entirely, silently falling through to "custom" and forcing a manual
  // mapping every time.
  // TASKS.csv #335 — a "depth"/"total_depth" column no longer vetoes collars: it is the hole LENGTH in
  // most collar exports (total_depth is the collar schema's own length alias), and the veto sent
  // hole_id,x,y,z,azimuth,dip,total_depth to the survey rule below, which the multi-file drop then
  // auto-committed as "N survey stations" with the coordinates thrown away. A survey table has no
  // coordinate trio, so the trio itself is the discriminator. UTM_E/UTM_N/RL headers count too.
  const hasEast = has("easting") || hasCol("x") || hasCol("utm_e") || hasCol("utme") || hasCol("east");
  const hasNorth = has("northing") || hasCol("y") || hasCol("utm_n") || hasCol("utmn") || hasCol("north");
  const hasElev = has("elevation") || hasCol("z") || hasCol("rl") || hasCol("elev") || hasCol("utm_z");
  if (!has("from") && hasEast && hasNorth && hasElev) return "collars";
  // TASKS.csv #2151 — MGA_East / MGA_North / MGA_RL, GDA94_E / GDA94_N, GBMG_East / GBMG_North + Orig_RL: a grid pair and an elevation
  if (!has("from") && !has("depth_from") && gridCoordinateColumns(headers).length && (hasElev || gridElevation(headers))) return "collars";
  // Structure picks checked before survey: real bug found here — a structure CSV with columns
  // like depth_m/inferred_dip_deg/assumed_dip_azimuth satisfies the survey check below (it has
  // "azimuth", "depth", and no "from"), AND guessColumn's substring matching resolves survey's
  // dip/azimuth/depth fields against those same columns (inferred_dip_deg contains "dip", etc.) —
  // so a structure CSV used to get auto-committed as bogus downhole survey stations, silently
  // and confidently, no mapping dialog and no chance to catch it. Checking structure_type first
  // (before survey ever gets a look) fixes it at the source.
  if (has("structure_type") && !has("from")) return "structure"; // #604: with from / to it is a zone log (below)
  // TASKS.csv #426 — a downhole structure file without a literal structure_type column (HoleID, Depth,
  // Type, DipDirection, Dip_deg) used to fall through to the vein rule. Point data (depth, no from) with a
  // dip AND something only a structure table has — a type/struct column, a dip direction, strike or alpha.
  const structy = has("struct") || hasCol("type") || has("dipdir") || has("dip_dir") || has("dipdirection") || has("dip_direction") || hasCol("dd") || has("strike") || has("alpha");
  if (!has("from") && has("depth") && has("dip") && structy) return "structure";
  if (!has("from") && has("depth") && has("alpha")) return "structure"; // #427 — oriented-core alpha/beta logging
  if (has("azimuth") && (has("depth") || hasCol("dist") || hasCol("distance")) && !has("from")) return "survey"; // dist: #1105
  // TASKS.csv #546 — Micromine (HOLE, DEPTH, AZI, DIP) and Datamine (BHID, AT, BRG, DIP) survey files: a short
  // azimuth column and a depth / AT column, a dip, no from/to and nothing only a structure table has. They used to
  // open as "Structure planes" and "Custom".
  const shortAz = hasCol("azi") || hasCol("az") || hasCol("azim") || hasCol("brg") || hasCol("bearing");
  if (!has("from") && shortAz && (has("depth") || hasCol("at") || hasCol("md") || hasCol("dist") || hasCol("distance")) && has("dip") && !structy) return "survey"; // dist / distance: #1105 (Micromine HOLEID, DIST, AZIMUTH, DIP)
  // TASKS.csv #600 — interval logs from logging software, recognised by their PRIMARY column's name (the
  // header after any "Table." prefix): Alt1_Code / Alt_Assemblage, Min1_Code / Min_Code1, Vein1_Comp /
  // Vein_Type1, Ave_Reading / MagSus1, BulkDens_Calc / SG_D. They used to fall through to "litho" (a UnitCode
  // column made the mag-sus log a lithology) or "vein" (a Sample_Type column), with the value unmapped.
  const base = lower.map((h) => h.trim().split(".").pop());
  const any = (re) => base.some((h) => re.test(h));
  if ((has("from") || has("depth")) && any(/^(ave|avg)_reading$|^magsus\d*$|^mag_?sus(ceptibility)?(_si)?$|^mag_si$|^mag_reading$/)) return "magsusc"; // #605: point readings (depth) too; mag_reading: #1345
  if (has("from") && any(/^sul(ph|f)?(ide)?s?_min_?1$/)) return "mnlgy"; // #1345 — a sulphide log (SUL_MIN_1, SUL_MIN_1_PCT) was read as lithology
  if (has("from") && any(/^bulkdens|^sg(_d|_calc)?$|^specific_gravity$/)) return "sg";
  if (has("from") && any(/^min\d*_code\d*$|^min_mnlgy$/)) return "mnlgy";
  // #600 (40958Z) — a domain log ("Domain Type": waste / ore zone...) is not veins (the bare "type" rule below) nor
  // lithology: a custom layer, so the dialog asks instead of committing it into Veins.
  if (has("from") && any(/(^|_)domain(_type|_code|_name)?$/)) return "custom";
  if (has("from") && any(/^vein\d*_(comp|type|code)\d*$|^veins$/)) return "vein"; // code / veins: TASKS.csv #2153 (WAMEX Vein2_Code, "Veins")
  if (has("from") && any(/^brecc|^breccia|^brx(_|$)|^bx_(type|code)$/)) return "breccia"; // #608 (MX: brecc_lith)
  if (has("from") && any(/^alt\d*_code$|^alt_assemblage$/)) return "alt";
  // TASKS.csv #2153 (WA drillhole review) — a geology log's primary lithology column (Lithology1, Lith1, Rock1, GEOL_Rock1, LithCode, Maj Lithcode)
  // makes it a lithology log before its other columns are read: Alt1_Mineral / Min1_Type sent WAMEX geology_1 / geology_4 to Mineralization
  if (has("from") && any(/^(geol_)?(maj(or)?_)?(lith(ology)?|rock|lith_?code)\d*(_code)?\d*$/)) return "litho";
  // #2162 — a weathering / oxidation / regolith log
  if (has("from") && any(/^(weath(ering)?|oxid(ation)?|ox_?state|oxide_?zone|redox|regol(ith)?|reg)(_?(code|state|type|zone|class|unit|grade))?\d*$/)) return "weath";
  // #2153 — an alteration log named by its mineral or style (Alt1_Mineral, Alt1_Style, AltN1), not by a code
  if (has("from") && any(/^alt\d*_(mineral|min|style)$|^altn\d+$/)) return "alt";
  // #2153 — a density log read as wet and dry weights with the result in "Reading"
  if (has("from") && any(/^weight_?wet$|^wet_?weight$/) && any(/^weight_?dry$|^dry_?weight$/)) return "sg";
  // TASKS.csv #604 — a structure log by interval (GEOLFROM / GEOLTO + Struc_Code, From / To + Structure_Type): a
  // layer of structural zones. It used to fall to lithology (Copley) or, by its name, to point structure picks.
  if (has("from") && any(/^struc(t|ture)?_?(code|type)$/)) return "structzone";
  // Mineralization: was previously gated on BOTH "assemblage" AND "mineral" being present, but
  // the mnlgy schema's own value-column aliases are just ["mineral"] (see TARGET_SCHEMAS.mnlgy
  // above) — a real mnlgy CSV never has an "assemblage" column, so that combined check could
  // never actually match one, and it fell through to the generic from/to→"litho" guess instead.
  // TASKS.csv #1345 (42807Z) — oriented-core picks logged with GEOLFROM = GEOLTO (acQuire "STRUCTURE POINTS"): alpha AND beta columns, and no
  // primary interval column matched above (a vein log with Vein1_Alpha / Vein1_Beta stays veins), so STPT_MINERALIZATION no longer sends
  // 551 picks to Mineralization
  if (any(/(^|_)alpha$/) && any(/(^|_)beta$/)) return "structure";
  if (has("mineral")) return "mnlgy";
  if (has("rqd")) return "geotech";
  if (has("recovery") || has("rec_pct")) return "recovery";
  // "sg"/"density" are common enough words to false-positive against other schemas' own columns
  // (e.g. a lithology "unit" description mentioning density in free text) — checked after every
  // other from/to-interval schema's own more specific keywords above, same "least specific last"
  // ordering as the vein/alteration "type"/"assemblage" disambiguation below.
  if (has("specific_gravity") || hasCol("sg") || has("density")) return "sg";
  if (has("mag_avg") || has("mag_susc")) return "magsusc";
  if (has("litho") || has("unit")) return "litho";
  // Veins and alteration share the "assemblage" alias (both schemas list it), so a CSV that uses
  // "type"/"vein_type" rather than "assemblage" is checked first to disambiguate the common case
  // (see sample_data's own vein.csv, which uses a "type" column).
  // TASKS.csv #2150 (WA review #2148) — the bare "type" rule took a gold assay table (SAMPLETYPE, Au, AuRp1) as a vein log. A type column
  // that is the sample's, the hole's or the lab's is not a vein type, and a table with element columns is not a vein log.
  // #2189 — anywhere in the name, not only at its start: WAMEX's dsHoleType (the drilling method by interval) went to Veins
  const NOT_VEIN_TYPE = /(samp(le)?|hole|drill|dh|qc|lab|assay|analy(sis|te)|method|survey|instr(ument)?|data|record|point|row|rig|bit|core)_?type/;
  const typeCols = base.filter((h) => /type/.test(h));
  const veinishType = typeCols.some((h) => !NOT_VEIN_TYPE.test(h));
  const elements = headers.some((h) => isElementColumn(h));
  if (has("vein_type") || (veinishType && !elements && !has("assemblage"))) return "vein";
  if (has("assemblage")) return "alt";
  // #2189 — an interval table whose only 'type' is the hole's / drilling's, with nothing geological to colour by, is a custom layer
  if (has("from") && typeCols.length && !veinishType && !any(/lith|rock|unit|formation|strat/)) return "custom";
  if (has("from") && has("to")) return "litho";
  if (has("depth")) return "structure";
  return "custom";
}
// TASKS.csv #605 — what a file or worksheet NAME says it is ("Vein Log.csv", a workbook's "Specific Gravity"
// sheet). Used by guessTargetFor only when that type's required columns can be mapped from the headers;
// otherwise the header-based guess stands. Assays are recognised separately (looksLikeAssay).
const NAME_HINTS = [
  [/collar|coordinates|\bheaders?\b/, "collars"], [/survey/, "survey"], [/litholog|\blitho/, "litho"],
  [/\bweathering|\boxidation|\bregolith/, "weath"] /* #2162 */, [/alteration|\balt\b/, "alt"], [/mineral/, "mnlgy"], [/\bveins?\b(?!\s*min)/, "vein"], /* "Vein Min" is a mineral list (40958Z) */ [/breccia|\bbrx\b|\bbx\b/, "breccia"], [/geotech|\brqd\b/, "geotech"],
  [/recovery/, "recovery"], [/specific.?gravity|\bsg\b|density/, "sg"], [/mag.?sus|magnetic/, "magsusc"], [/struct\w*\s+(interval|zone)/, "structzone"] /* #604 */, [/struct/, "structure"],
];
export function targetFromName(name) {
  const base = String(name || "").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[_]+/g, " ");
  for (const [re, t] of NAME_HINTS) if (re.test(base)) return t;
  return null;
}
export function schemaSatisfied(target, mapping) {
  const schema = TARGET_SCHEMAS[target];
  if (!schema) return false;
  if (schema.fields.some((f) => f.required && !mapping[f.key])) return false;
  return !schema.oneOf || schema.oneOf.some((keys) => keys.every((k) => mapping[k]));
}
// Logs with no built-in layer, named for what they hold: ask, as a custom layer. #600 (40958Z): a void / cavity log is not veins (its bare
// "Type" column hit the vein rule); #1345: a UV fluorescence log is not lithology; #1502 (40958Z): Oxidation, Silicification and
// OriCore (the core-orientation marks) were all guessed as Lithology from a generic code / description column.
// TASKS.csv #3204 (#3195, Galore Creek) — geotechnical test tables (lock angles, pocket penetrometer, point load, UCS) and an overburden log went to
// Lithology / Structure planes / Veins / SG by a stray 'LITH' / 'Structure' / 'Test Type' column: a custom layer, asked
const CUSTOM_LOG_NAMES = /\b(voids?|cavit(y|ies))\b|fluoresc|silicif|\bori(ented)?[\s_-]*core\b|\boricore\b|lock[\s_-]*angles?|penetrometer|point[\s_-]*load|(^|[^a-z])ucs([^a-z]|$)|overburden/i; // oxidation / weathering: their own layer since #2162
// TASKS.csv #2339 (review #2325, WA uranium) — a hyperspectral (HyLogger TSA) table: mineral / weight pairs and absorption-feature
// parameters (TSA_S Mineral1, TSA_S Weight1, w2200, d2200, hqd2200, kaol_cryst, FeOx ...). geophysics_1.csv (34 columns, one U3O8_ppm
// among them) went to the assay import as 5,394 U results, double-counting the lab's. -> the number of spectral columns
const SPECTRAL_COL = /(^|[\s_])tsa([\s_]|$)|mineral[\s_]*\d|weight[\s_]*\d|^[wd]\d{3,4}$|hqd|kaol|feox|swir|vnir/i;
export const spectralColumns = (headers) => (headers || []).filter((h) => SPECTRAL_COL.test(String(h).trim())).length;
// the mineral column of a spectral table: the first Mineral1 (TSA_S before TSA_V by header order)
export const spectralMineralColumn = (headers) => (headers || []).find((h) => /mineral[\s_]*1$/i.test(String(h).trim())) || "";
// rows (optional, TASKS.csv #2884): the file's rows, for the zero-length test below
// #3204 — a type column with the orientation of each pick (alpha and beta, or dip with dip direction / strike): structure planes, whatever else is numeric
function structurePicks(headers) {
  const m = guessMapping("structure", headers);
  return !!(m.value && ((m.alpha && m.beta) || (m.dip && (m.azimuth || m.strike))));
}
export function guessTargetFor(headers, name, rows = null) {
  if (CUSTOM_LOG_NAMES.test(String(name || ""))) return "custom";
  // #2884 (review #2876, WA iron) — From equals To on every sampled row and a log channel is named (Density_Best, Gamma_Best ...): point
  // readings, a downhole log, before any name hint ("density.csv" would keep Specific gravity: millions of zero-length intervals)
  // TASKS.csv #3204 (#3195, Galore Creek) — not a table of oriented structure picks: Point Structures (GEOLFROM = GEOLTO; PTSTR_STR_TYPE, PTSTR_ALPHA,
  // PTSTR_BETA) has numbers in every row too, and went to Custom layer while the same columns of Fault Structures were read as Structure planes
  if (rows && zeroLengthRows(headers, rows) === true && looksLikeLogTable(headers, rows) && !structurePicks(headers)) return "custom";
  if (spectralColumns(headers) >= 4) return "custom"; // #2339 — a mineral table from spectra, not Mineralization (ore minerals)
  // TASKS.csv #2317 — regolith boundary events (BOCO, TOFR, ... at one depth per hole, no from / to): a custom point layer of codes, not
  // structure picks without an orientation (where 'Event_Code + Depth' used to land)
  if (looksLikeEventTable(headers)) return "custom";
  const hint = targetFromName(name);
  if (hint) {
    const m = guessMapping(hint, headers);
    if (schemaSatisfied(hint, m)) return hint;
    // TASKS.csv #1502 — the name is the stronger hint: a file shaped like the named layer (its hole and depth columns found) whose value
    // column has a name GeoStrix does not know keeps that layer, and the dialog asks for the column (never committed unseen: the value
    // is missing). Mineralization.csv with only a Description column went to Lithology, whose aliases include "description".
    // A "structure" name on a file with a To column is an interval log (structural zones, #604: Copley's GEOLFROM / GEOLTO): the headers decide.
    const interval = hint === "structure" && guessMapping("structzone", headers).to;
    if (!interval && TARGET_SCHEMAS[hint]?.fields.every((f) => !f.required || f.key === "value" || m[f.key])) return hint;
  }
  if (looksLikeLogTable(headers, rows)) return "custom"; // TASKS.csv #2160 — a gamma / density / susceptibility log, not SG or Lithology (after the name hint)
  return guessTarget(headers);
}
export function getCol(row, keys) {
  for (const k of keys) { const found = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k); if (found && row[found] !== undefined && row[found] !== "") return row[found]; }
  return undefined;
}
export function distinctValues(rows) {
  const counts = new Map();
  rows.forEach((r) => { const k = String(r.value); counts.set(k, (counts.get(k) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

// TASKS.csv #283 (Micromine-specialist review) — collar import used to be a bare
// `new Map([...collars, ...rows].map(c => [c.hole_id, c]))`: last-write-wins keyed on hole_id, with
// no diff and no confirmation, both for duplicates WITHIN one file and for a hole_id that already
// existed in the project. The dangerous real-world case isn't the deliberate re-import of an updated
// surveyor list — it's grabbing an OLD collar file from the wrong folder, after which every matching
// hole silently takes on stale x/y/z/azimuth/dip and the previous values are simply gone. dataQC.js
// flags repeated hole_ids, but only as a generic warning that doesn't run on import and never says
// whether the COORDINATES actually changed.
//
// This is the pure diff the importer now runs first, so it can say exactly what would change (and ask)
// before anything is committed. Kept here in layers.js beside the other import helpers
// (guessColumn/guessTarget/TARGET_SCHEMAS) and free of any React/state so it can be unit-verified in
// plain Node.
const COLLAR_COMPARE_FIELDS = ["x", "y", "z", "azimuth", "dip", "length"];

// "Same value" for a collar field. Both missing counts as same (an import that simply doesn't carry
// an optional azimuth column must not read as "azimuth changed"), and numbers compare with a small
// tolerance so a re-export that round-trips 520000.5 through more decimal places isn't reported as an
// edit. NaN (an unparseable cell) is treated as missing for the same reason.
function sameCollarValue(a, b) {
  const ma = a == null || (typeof a === "number" && Number.isNaN(a));
  const mb = b == null || (typeof b === "number" && Number.isNaN(b));
  if (ma && mb) return true;
  if (ma || mb) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return String(a) === String(b);
}

// existing/incoming: arrays of collar objects ({hole_id, x, y, z, azimuth?, dip?, length?}).
// Returns { newHoles, unchanged, changed:[{hole_id, fields, before, after, shift}], duplicatesInFile }
// where `shift` is the horizontal+vertical distance the collar would move (world units), which is the
// number that actually matters to a geologist looking at this prompt.
// TASKS.csv #600 — a value only one side has is not a conflict: collars often come in two files (a BC ARIS
// export: "Coordinates" with x / y / z, then "Headers" with the same x / y / z plus the actual depth and the
// planned azimuth / dip). The second file used to count every hole as CHANGED (length: missing -> 452), asked
// to overwrite all 19, and declining dropped the depths; importing them the other way round "changed" the
// depth to missing, and accepting wiped it. Now: incoming missing -> keep the existing value; existing missing
// -> a FILL (merged without asking); only two different present values are a change. mergeCollar applies it.
const missingCollarValue = (v) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
export function mergeCollar(prev, incoming, overwrite) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(incoming)) {
    if (missingCollarValue(v)) continue;
    if (k === "attrs" && v && typeof v === "object") { out.attrs = mergeCollar(prev.attrs || {}, v, overwrite); continue; } // #1655 — kept columns merge one by one too
    if (overwrite || missingCollarValue(prev[k])) out[k] = v;
  }
  return out;
}
// TASKS.csv #600 — a collar table can hold SEVERAL location records per hole with a rank (an MX Deposit
// "Collar Locations" export: rank 0 the current location, higher ranks older/alternative fixes — the
// 42648Z file has 691 rows for 544 holes, DH24-119 seven times, one of them with a 118.9 m depth for a 700 m
// hole). "Last row wins" kept whichever came last. When the file has a rank column, the LOWEST numeric rank
// wins (ties: the later row); with no rank column nothing changes here. Raw rows in, raw rows out (first-
// appearance order); { rows, rankColumn, dropped, holes } for the notice.
const RANK_ALIASES = ["rank", "loc_rank", "location_rank", "collar_rank", "priority"];
export function pickRankedCollarRows(rawRows, holeCol, headers) {
  const rankColumn = guessColumnExact(headers || [], RANK_ALIASES);
  if (!rankColumn || !holeCol) return { rows: rawRows, rankColumn: null, dropped: 0, holes: [] };
  const best = new Map(), order = [];
  const rankOf = (r) => { const v = num(r[rankColumn]); return Number.isFinite(v) ? v : Infinity; };
  for (const r of rawRows) {
    const id = String(r[holeCol] ?? "").trim();
    const prev = best.get(id);
    if (!prev) { best.set(id, r); order.push(id); continue; }
    if (rankOf(r) <= rankOf(prev)) best.set(id, r);
  }
  const counts = new Map(); rawRows.forEach((r) => { const id = String(r[holeCol] ?? "").trim(); counts.set(id, (counts.get(id) || 0) + 1); });
  return { rows: order.map((id) => best.get(id)), rankColumn, dropped: rawRows.length - order.length, holes: [...counts].filter(([, n]) => n > 1).map(([id]) => id) };
}

// TASKS.csv #1655 (review #1645, Copley) — the other fields a collar carries (an import's extra fields, the kept columns in attrs) are
// compared too: re-importing 9 collars with PROSPECT / Drill_Purpose / STARTDATE added said '9 already present and identical' though
// all three were then on every collar. -> [[label, before, after]] for each field either side has
const collarExtraValues = (c) => {
  const out = new Map();
  for (const [k, v] of Object.entries(c || {})) if (k !== "hole_id" && k !== "attrs" && !k.startsWith("_") && !COLLAR_COMPARE_FIELDS.includes(k)) out.set(k, v);
  for (const [k, v] of Object.entries(c?.attrs || {})) if (!out.has(k)) out.set(k, v);
  return out;
};
function extraFieldsDiff(prev, r) {
  const a = collarExtraValues(prev), b = collarExtraValues(r), fills = [], fields = [];
  for (const [k, v] of b) { if (missingCollarValue(v)) continue; const p = a.get(k); if (missingCollarValue(p)) fills.push(k); else if (!sameCollarValue(p, v)) fields.push(k); }
  return { fills, fields, before: Object.fromEntries(fields.map((k) => [k, a.get(k)])), after: Object.fromEntries(fields.map((k) => [k, b.get(k)])) };
}

export function diffCollarImport(existing, incoming) {
  const byId = new Map((existing || []).map((c) => [c.hole_id, c]));
  const newHoles = [], unchanged = [], changed = [], duplicatesInFile = [], filled = [];
  // #600: a repeated hole is reported as a duplicate and judged ONCE, on its last row (the one the merge keeps)
  const lastById = new Map();
  for (const r of incoming || []) { if (lastById.has(r.hole_id)) duplicatesInFile.push(r.hole_id); lastById.set(r.hole_id, r); }
  for (const r of lastById.values()) {
    const prev = byId.get(r.hole_id);
    if (!prev) { newHoles.push(r.hole_id); continue; }
    const ex = extraFieldsDiff(prev, r); // #1655
    const fills = [...COLLAR_COMPARE_FIELDS.filter((k) => missingCollarValue(prev[k]) && !missingCollarValue(r[k])), ...ex.fills];
    if (fills.length) filled.push({ hole_id: r.hole_id, fields: fills });
    const fields = [...COLLAR_COMPARE_FIELDS.filter((k) => !missingCollarValue(prev[k]) && !missingCollarValue(r[k]) && !sameCollarValue(prev[k], r[k])), ...ex.fields];
    if (!fields.length) { if (!fills.length) unchanged.push(r.hole_id); continue; }
    const d = (k) => (Number.isFinite(prev[k]) && Number.isFinite(r[k]) ? r[k] - prev[k] : 0);
    changed.push({
      hole_id: r.hole_id, fields,
      before: { ...Object.fromEntries(fields.filter((k) => COLLAR_COMPARE_FIELDS.includes(k)).map((k) => [k, prev[k]])), ...ex.before },
      after: { ...Object.fromEntries(fields.filter((k) => COLLAR_COMPARE_FIELDS.includes(k)).map((k) => [k, r[k]])), ...ex.after },
      shift: Math.hypot(d("x"), d("y"), d("z")),
    });
  }
  return { newHoles, unchanged, changed, duplicatesInFile, filled };
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
