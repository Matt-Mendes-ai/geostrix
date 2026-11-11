import { isMarkedQcRow } from "./qaqc.js"; // TASKS.csv #601 (qaqc.js imports geochem.js too: used at call time only)
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
// ============================================================
// Geochemistry: element handling + diagram projections
// ============================================================

export const ELEMENT_SYMBOLS = ["Ag","Al","As","Au","B","Ba","Be","Bi","Br","Ca","Cd","Ce","Cl","Co","Cr","Cs","Cu",
  "Dy","Er","Eu","F","Fe","Ga","Gd","Ge","Hf","Hg","Ho","In","Ir","K","La","Li","Lu","Mg","Mn","Mo","Na","Nb",
  "Nd","Ni","Os","P","Pb","Pd","Pr","Pt","Rb","Re","Rh","Ru","S","Sb","Sc","Se","Si","Sm","Sn","Sr","Ta","Tb",
  "Te","Th","Ti","Tl","Tm","U","V","W","Y","Yb","Zn","Zr"];
// Elements a bare header (no unit in it) is read in %: the ones a multi-acid ICP package reports in percent (ALS ME-ICP61:
// Al Ca Fe K Mg Na S Ti; Si comes from whole-rock). TASKS.csv #718 — Cr, Mn and P were listed too, but those packages
// report them in ppm, and Cr at 5-100 ppm (normal in felsic / intermediate volcanics) was read as 5-100 % (the #210
// rule only switches to ppm above 100). Whole-rock Cr2O3 / MnO / P2O5 arrive as oxide headers (#403) and stay %.
const MAJOR_PCT = new Set(["Al","Ca","Fe","K","Mg","Na","S","Ti","Si"]);
// TASKS.csv #718 — the unit was not in the header: it came from the element symbol alone (shown as "assumed")
export const unitAssumed = (header) => !/ppm|ppb|gpt|g\/t|pct|%/i.test(String(header || "")) && !oxideOfHeader(header);

// TASKS.csv #210 — real-world lab exports rarely use a bare element symbol as the header: a
// method/instrument code commonly sits BETWEEN the element and its unit (e.g. pXRF exports like
// "Ag_XRF_Corrected_ppm_D"), which the old approach (strip from the first unit-token match anywhere
// in the string, then require an EXACT match against the remainder) couldn't handle — it stripped
// "_ppm_D" off the end but left "Ag_XRF_Corrected" behind, no exact match. Matching on the FIRST
// delimiter-separated token instead (the element symbol always leads a lab column name in every
// real export seen so far — BESTEL, XRF, ICP, AA, and generic exports alike) is robust to whatever
// comes after it, unit token present or not, method code or not.
export function isElementColumn(header) {
  if (!header) return false;
  const ox = oxideOfHeader(header); // TASKS.csv #403 — "SiO2", "Al2O3 (%)", "Fe2O3T_pct" -> Si / Al / Fe
  if (ox) return ox.symbol;
  const cleaned = String(header).replace(/\(.*?\)/g, " "); // drop parenthetical units, e.g. "Au (ppm)"
  const first = cleaned.split(/[\s_-]+/)[0].trim();
  return ELEMENT_SYMBOLS.find((s) => s.toLowerCase() === first.toLowerCase()) || numberedElement(first) || gluedUnitElement(first) || false;
}
// TASKS.csv #2157 (WA drillhole review) — the unit glued to the symbol: AUPPB, AUPPM, PTPPB, CUPCT, NIPC (336 / 226 / 147 WAMEX files)
const GLUED_UNIT = /^([A-Za-z]{1,2})(ppb|ppm|pct|pc|gpt)$/i;
function gluedUnitElement(token) {
  const m = GLUED_UNIT.exec(token);
  if (!m) return false;
  const sym = m[1].length === 1 ? m[1].toUpperCase() : m[1][0].toUpperCase() + m[1][1].toLowerCase();
  return ELEMENT_SYMBOLS.includes(sym) ? sym : false;
}
// TASKS.csv #2150 follow-up (WA review: WAMEX gold_small) — a numbered repeat of a two-letter symbol: Au1, Ag2, AuRp1, AuDup1, AU1.
// The symbol keeps its own case (Co2 = cobalt) or is all capitals; CO2 / CO3 and SN1 are not cobalt or tin, and the
// one-letter symbols (S1, W1, K2, U1) are left out: too often a code or a width.
const NUMBERED = /^([A-Z][a-z]|[A-Z]{2})(?:Rp|RP|rp|R|Dup|DUP|dup|D)?\d{1,2}$/;
const NOT_NUMBERED = /^(CO[23]|SN\d{1,2})$/; // all capitals only: carbon dioxide / carbonate, a sample number (Sn1 is tin)
function numberedElement(token) {
  const m = NUMBERED.exec(token);
  if (!m || NOT_NUMBERED.test(token)) return false;
  const sym = m[1][0] + m[1][1].toLowerCase();
  return ELEMENT_SYMBOLS.includes(sym) ? sym : false;
}

// TASKS.csv #403 — whole-rock oxide columns. Values are stored as ELEMENT wt% (everything downstream —
// TAS, AFM, Jensen, the alteration box — calls toOxide() on the element value), so an oxide column is
// divided by its oxide/element mass ratio at import. It used to be unrecognised; mapping "SiO2" to Si by
// hand then stored 65 (% SiO2) as if it were % Si, and toOxide multiplied it by 2.139 again (139% SiO2 on
// TAS). The conversion is keyed on the HEADER, so a hand-mapped oxide column converts too, and a column
// that is already element % ("Si_pct") never does. Total-iron forms (Fe2O3T, FeOT, TFe2O3) are total iron
// expressed as that oxide. LOI is not an element and is not imported as one.
const OXIDE_HEADERS = {
  SiO2: ["Si", 2.1392], TiO2: ["Ti", 1.6681], Al2O3: ["Al", 1.8895], Fe2O3: ["Fe", 1.4297], FeO: ["Fe", 1.2865],
  MnO: ["Mn", 1.2912], MgO: ["Mg", 1.6583], CaO: ["Ca", 1.3992], Na2O: ["Na", 1.3480], K2O: ["K", 1.2046],
  P2O5: ["P", 2.2914], Cr2O3: ["Cr", 1.4615], BaO: ["Ba", 1.1165], SrO: ["Sr", 1.1826], ZrO2: ["Zr", 1.3508],
  // TASKS.csv #2157 (WA drillhole review) — the commodity and trace oxides of WA lithium, nickel, iron and rare-element assays (Li2O and Ta2O5,
  // the lithium project's commodities, were dropped). Oxide / element mass ratios from IUPAC atomic weights (Li 6.94, O 15.999, ...).
  Li2O: ["Li", 2.1527], Ta2O5: ["Ta", 1.221], Nb2O5: ["Nb", 1.4305], Rb2O: ["Rb", 1.0936], Cs2O: ["Cs", 1.0602], SnO2: ["Sn", 1.2695],
  As2O3: ["As", 1.3203], NiO: ["Ni", 1.2726], PbO: ["Pb", 1.0772], Sb2O3: ["Sb", 1.1971], ZnO: ["Zn", 1.2447], CoO: ["Co", 1.2715],
  ThO2: ["Th", 1.1379], CuO: ["Cu", 1.2518], U3O8: ["U", 1.1792], La2O3: ["La", 1.1728], Bi2O3: ["Bi", 1.1148], WO3: ["W", 1.2611],
  HfO2: ["Hf", 1.1793], CeO2: ["Ce", 1.2284], Y2O3: ["Y", 1.2699], V2O5: ["V", 1.7852], SO3: ["S", 2.4971],
};
// #2157 — misspellings seen in WA lab exports: a zero for the letter O
const OXIDE_TYPOS = { al203: "Al2O3", si02: "SiO2", ti02: "TiO2", fe203: "Fe2O3", p205: "P2O5", k20: "K2O", na20: "Na2O", mg0: "MgO", ca0: "CaO", mn0: "MnO" };
// TASKS.csv #600 (40958Z, performance) — the answer depends only on the header, and importers ask once per CELL:
// 83,670 x 49 cells spent ~6 s of a 10.8 s assay commit here. Cached per header (frozen: callers only read it).
const OXIDE_CACHE = new Map();
export function oxideOfHeader(header) {
  if (!header) return null;
  const k = String(header);
  if (OXIDE_CACHE.has(k)) return OXIDE_CACHE.get(k);
  const v = oxideOfHeaderUncached(k);
  if (OXIDE_CACHE.size > 5000) OXIDE_CACHE.clear();
  OXIDE_CACHE.set(k, v ? Object.freeze(v) : null);
  return OXIDE_CACHE.get(k);
}
function oxideOfHeaderUncached(header) {
  const first = String(header).replace(/\(.*?\)/g, " ").split(/[\s_-]+/)[0].trim();
  // As written, then without a total-iron suffix ("Fe2O3T", "FeOtot"), then without a "T" prefix ("TFe2O3").
  const candidates = [first, first.replace(/(tot|total|T|t)$/, ""), first.replace(/^T/, "")];
  const key = candidates.map((c) => Object.keys(OXIDE_HEADERS).find((k) => k.toLowerCase() === c.toLowerCase()) || OXIDE_TYPOS[c.toLowerCase()]).find(Boolean); // typos: #2157
  if (!key) return null;
  const [symbol, factor] = OXIDE_HEADERS[key];
  return { oxide: key, symbol, factor };
}
// Element wt% from a value read under `header` (unchanged when the header is not an oxide).
export function fromOxideHeader(value, header) {
  if (value == null) return value;
  const ox = oxideOfHeader(header);
  return ox ? value / ox.factor : value;
}
// TASKS.csv #718 — whole-rock oxides are wt% (was implied by Cr / Mn / P being on MAJOR_PCT); #2157 — unless the header says ppm / ppb
// (Ta2O5_ppm: 85 ppm Ta2O5 was read as 85 % and stored as 696,150 ppm Ta). The unit an oxide column's values are in.
export const oxideUnit = (header) => { const h = String(header).toLowerCase(); return h.includes("ppb") ? "ppb" : h.includes("ppm") ? "ppm" : "%"; };
// TASKS.csv #2487 (review #2486, WA lithium) — a grade REPORTED AS its oxide: the element stays the symbol (Li), the unit carries the
// basis ("% Li2O", "ppm Ta2O5") and the stored numbers are the oxide's, as the lab reports them. Every reader that converts through
// convertUnit / valueIn gets the element when it asks for "%" / "ppm" / "ppb" (the diagrams, ratios, the oxide factor once), and the
// oxide when it asks in the element's own unit (cut-offs, caps, labels, exports). -> { base: "%"|"ppm"|"ppb", oxide, factor }
export const COMMODITY_OXIDES = new Set(["Li2O", "Ta2O5", "Nb2O5", "Cs2O", "Rb2O", "SnO2", "U3O8", "WO3", "V2O5"]); // default kept as the oxide at import
const BASIS_CACHE = new Map();
export function unitBasis(unit) {
  const u = unit == null ? "ppm" : String(unit);
  let b = BASIS_CACHE.get(u);
  if (b) return b;
  const m = /^(%|ppm|ppb) ([A-Z][A-Za-z0-9]*)$/.exec(u.trim());
  b = m && OXIDE_HEADERS[m[2]] ? { base: m[1], oxide: m[2], symbol: OXIDE_HEADERS[m[2]][0], factor: OXIDE_HEADERS[m[2]][1] } : { base: u === "%" || u === "ppb" ? u : "ppm", oxide: null, symbol: null, factor: 1 };
  if (BASIS_CACHE.size > 200) BASIS_CACHE.clear();
  BASIS_CACHE.set(u, Object.freeze(b));
  return b;
}
export const oxideBasisUnit = (base, oxide) => `${base} ${oxide}`;
// an import element read from an oxide column: kept as the oxide (its own choice, else a commodity oxide by default), or stored as the element
export function keepsOxide(e) { const ox = oxideOfHeader(e?.header); return !!ox && (e.keepOxide ?? COMMODITY_OXIDES.has(ox.oxide)); }
// the unit an import element is stored in: an oxide column kept as the oxide -> "% Li2O"; stored as the element -> the header's % / ppm / ppb
// #2490 — a unit the user picked in the dialog wins over the header's (the box beside an oxide column was inert)
export const oxideColumnUnit = (e, header = e?.header) => (header === e?.header && e?.unitChosen && e?.unit ? e.unit : oxideUnit(header));
export function importStoreUnit(e) { const ox = oxideOfHeader(e?.header); return !ox ? e.unit : keepsOxide(e) ? oxideBasisUnit(oxideColumnUnit(e), ox.oxide) : oxideColumnUnit(e); }
// TASKS.csv #2490 — the values over 100 in the per-cent oxide columns of the chosen elements (impossible as wt%): -> [{ symbol, header, n,
// example: { hole, from, to, value } }]
export function oxidesOver100(rows, elements, mapping = {}) {
  const out = [];
  for (const e of elements || []) {
    if (!oxideOfHeader(e.header) || oxideColumnUnit(e) !== "%") continue;
    let n = 0, ex = null;
    for (const r of rows || []) { const v = parseAssayValue(r?.[e.header]); if (Number.isFinite(v) && v > 100) { n++; if (!ex) ex = { hole: r[mapping.hole_id], from: r[mapping.from], to: r[mapping.to], value: v }; } }
    if (n) out.push({ symbol: e.symbol, header: e.header, n, example: ex });
  }
  return out;
}
// element ppm from a value in `unit`, and back
// (the plain units first: valueIn runs per sample in every estimate, so they take no lookup)
const elementPpm = (v, unit) => {
  if (unit === "%") return v * 10000; if (unit === "ppb") return v / 1000; if (unit === "ppm" || unit == null) return v;
  const b = unitBasis(unit); return (b.base === "%" ? v * 10000 : b.base === "ppb" ? v / 1000 : v) / b.factor;
};
const fromElementPpm = (ppm, unit) => {
  if (unit === "%") return ppm / 10000; if (unit === "ppb") return ppm * 1000; if (unit === "ppm" || unit == null) return ppm;
  const b = unitBasis(unit); const p = ppm * b.factor; return b.base === "%" ? p / 10000 : b.base === "ppb" ? p * 1000 : p;
};
export function inferUnit(header, symbol) {
  const h = String(header).toLowerCase();
  if (oxideOfHeader(header)) return oxideUnit(header);
  if (h.includes("ppb")) return "ppb";
  // TASKS.csv #210 — "gpt" (grams per tonne) is the standard unit lab reports use for Au/Ag/Pt/Pd
  // grades and is numerically identical to ppm for a solid (g/tonne = mg/kg = ppm), so it belongs in
  // the same bucket as ppm here — this only affects which unit shows up in the display dropdown and
  // valueIn()'s unit-conversion bucketing, not the raw stored value.
  if (h.includes("ppm") || h.includes("gpt") || h.includes("g/t")) return "ppm";
  if (h.includes("pct") || h.includes("%") || /percent|(^|[\s_-]|[a-z])pc$|wt_?pc/.test(h)) return "%"; // percent / pc / wt_pc: #2157
  if (symbol === "Au") return "ppm";
  return MAJOR_PCT.has(symbol) ? "%" : "ppm";
}
// TASKS.csv #600 / #542 — which column(s) to read for each element of a wide assay file. Real lab / database
// exports carry several columns per element: an ICP column capped at its upper limit, an ore-grade re-assay
// column filled only for those capped samples ("Cu" ppm capped at 10,000 + "Cu % Cu-OG62" for the 33 over-limit
// samples, in a BC ARIS drillhole database), descriptive columns ("Cu status", "Cu certificate") and error
// columns. The first matching header used to win, so Cu came from the 33-value ore-grade column and was
// missing for the other 3,757 samples. Now: the MAIN column is the one with the most numeric values (ties:
// a header that is just the symbol, then header order); an OVER-LIMIT column is another candidate whose values
// sit only where the main column is at its maximum (the cap), and fills those samples at import (converted to
// the main unit). A default-% element whose values run above 100 cannot be % and is read as ppm (Cr 1-665).
// rows: the parsed rows (header -> raw cell). Returns [{ symbol, header, unit, alts, overLimit }].
// TASKS.csv #2337 (review #2325, WA uranium) — a precious-metal column that does not say its unit: WAMEX's "Au" held 1,919 values with a
// median of 3 and a maximum of 4,010 (parts per billion on a uranium prospect), read as ppm under a tooltip that every one of 66 elements
// carried. Median above 1 and maximum above 100 is ppb for Au, Pt and Pd (a deposit-wide gold median of 1 g/t is very rare, a maximum
// of 100 g/t rarer still); rows sampled evenly, at most 20,000. -> { median, max } when the values read as ppb, else null
const PPB_METALS = new Set(["Au", "Pt", "Pd"]);
export function preciousReadsPpb(symbol, header, rows, max) {
  if (!PPB_METALS.has(symbol) || /ppm|ppb|gpt|g\/t|pct|%|oz/i.test(String(header)) || !(max > 100) || !rows?.length) return null;
  const step = Math.max(1, Math.floor(rows.length / 20000)), v = [];
  for (let i = 0; i < rows.length; i += step) { const x = parseAssayValue(rows[i][header]); if (x != null && Number.isFinite(x) && x > 0) v.push(x); }
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  const median = v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return median > 1 ? { median, max } : null;
}
const DESCRIPTIVE_COLUMN = /\b(status|certificate|cert|laboratory|lab|method|workflow|date|completed|analys(is|ed)|comment|flag|qc|batch|job|lod|dl|plot)\b/i;
// stats (optional, #2164): Map(header -> { n, max }) counted beforehand in chunks (assayColumnScan.js elementColumnStats)
export function pickElementColumns(headers, rows, stats = null) {
  const bySym = new Map();
  headers.forEach((h, order) => {
    const sym = isElementColumn(h);
    if (!sym) return;
    const words = String(h).replace(/[_]/g, " ");
    if (DESCRIPTIVE_COLUMN.test(words) || /error/i.test(h)) return;
    let n = 0, max = -Infinity;
    if (stats?.has(h)) ({ n, max } = stats.get(h));
    else for (const r of rows) { const v = parseAssayValue(r[h]); if (v != null && Number.isFinite(v)) { n++; if (v > max) max = v; } }
    // TASKS.csv #2185 — a column of words (P_TSA_A_Mineral1 = IntChlorite) is no element, whatever its header starts with
    if (!n && rows?.length) { let text = 0; for (let i = 0; i < rows.length && i < 200; i++) { const s = String(rows[i]?.[h] ?? "").trim(); if (s && !/^[<>]?\s*[-+]?[\d.]/.test(s)) text++; } if (text) return; }
    if (!bySym.has(sym)) bySym.set(sym, []);
    // #2157 — a lab repeat / duplicate / check column (AuRp1, Au-Rp1, Au_Rep, Au_Dup, Au_Check) is never the main column beside one that is not
    const repeat = /^[a-z]{1,2}[\s_-]*(rp|rep|repeat|dup|duplicate|chk|check|r)\d*([\s_-]|$)/i.test(String(h).replace(/\(.*?\)/g, "").trim());
    bySym.get(sym).push({ header: h, n, max, order, exact: String(h).trim() === sym, repeat });
  });
  const out = [];
  bySym.forEach((cands, symbol) => {
    const sorted = [...cands].sort((a, b) => Number(a.repeat) - Number(b.repeat) || b.n - a.n || Number(b.exact) - Number(a.exact) || a.order - b.order); // repeat: #2157
    const main = sorted[0];
    let unit = inferUnit(main.header, symbol);
    const unitInHeader = /ppm|ppb|gpt|g\/t|pct|%/i.test(main.header);
    // TASKS.csv #2490 (review #2486, WA lithium) — not for an oxide column: Fe2O3 / SiO2 in per cent with one impossible value over 100 were
    // relabelled ppm; that value is flagged by the dialog instead (oxidesOver100)
    if (unit === "%" && !unitInHeader && main.max > 100 && !oxideOfHeader(main.header)) unit = "ppm";
    const ppb = !unitInHeader ? preciousReadsPpb(symbol, main.header, rows, main.max) : null; // #2337
    if (ppb) unit = "ppb";
    let overLimit = null;
    if (main.n && Number.isFinite(main.max)) {
      for (const c of sorted.slice(1)) {
        if (!c.n) continue;
        let atCap = 0;
        for (const r of rows) { const og = parseAssayValue(r[c.header]); if (og == null) continue; if (parseAssayValue(r[main.header]) === main.max) atCap++; }
        if (atCap / c.n >= 0.9) { overLimit = { header: c.header, unit: inferUnit(c.header, symbol), limit: main.max, n: c.n }; break; }
      }
    }
    // TASKS.csv #2328 (review #2325, WA uranium) — the other method columns of the element (U_100, U_101, U, U_103 beside U_102): each sample
    // was analysed by one method set, so they hardly overlap; read from the fullest only, U kept 5,060 of 9,746 values. Their counts and how
    // many rows carry two or more of them; joined by default when at most 5 % of the rows with a value carry several (first value wins).
    const methodCols = sorted.slice(1).filter((c) => c.n > 0 && !c.repeat && (!overLimit || c.header !== overLimit.header)).map((c) => ({ header: c.header, n: c.n, unit: inferUnit(c.header, symbol) }));
    let withAny = 0, withSeveral = 0;
    if (methodCols.length && rows?.length) {
      const hs = [main.header, ...methodCols.map((c) => c.header)];
      for (const r of rows) { let k = 0; for (const h of hs) { const v = parseAssayValue(r[h]); if (v != null && Number.isFinite(v)) k++; } if (k) withAny++; if (k > 1) withSeveral++; }
    }
    const joinDefault = methodCols.length > 0 && withAny > 0 && withSeveral / withAny <= 0.05;
    out.push({ symbol, header: main.header, unit, alts: sorted.slice(1).map((c) => c.header), overLimit, n: main.n, ...(ppb ? { unitFromValues: ppb } : {}), // n: #1389 — values in the chosen column; unitFromValues: #2337
      ...(methodCols.length ? { methodCols, methodOverlap: { withAny, withSeveral }, join: joinDefault } : {}) }); // #2328
  });
  return out;
}

// TASKS.csv #2194 (review #2174, WA gold) — a WAMEX / acQuire assay table carries the lab's repeats as columns beside the element (Au, AuRp1,
// AuRp2; Au_Rpt, Au_Dup, AU_CHK). They had no role in the import and QAQC found 0 duplicates. -> [{ header, symbol }] for the chosen
// elements' repeat columns (never the column the element itself is read from).
// TASKS.csv #2350 (review #2325, WA uranium) — a lab method suffix after the repeat ('Au-Rp1_100', 54 pairs) hid it: a trailing _<digits> is
// stripped before the test. numbered: headers the user ticked among numberedRepeatCandidates (Au2, Pt2), kept as repeats too.
export function repeatColumns(headers, chosen, numbered = []) {
  const out = [];
  for (const e of chosen || []) {
    const re = new RegExp(`^${e.symbol}[\\s_-]*(rp|rpt|rep|repeat|dup|duplicate|chk|check|re-?assay)\\d*$`, "i");
    for (const h of headers || []) if (h !== e.header && re.test(String(h).replace(/\(.*?\)/g, "").trim().replace(/_\d+$/, ""))) out.push({ header: h, symbol: e.symbol });
    for (const h of numbered || []) if (h !== e.header && numberedOf(h) === e.symbol && !out.some((o) => o.header === h)) out.push({ header: h, symbol: e.symbol, numbered: true });
  }
  return out;
}
// 'Au2', 'Pt2', 'Au2_100' -> 'Au' (an element symbol, one digit, an optional method suffix); else null
function numberedOf(h) {
  const m = /^([A-Z][a-z]?)([1-9])(_\d+)?$/.exec(String(h).replace(/\(.*?\)/g, "").trim());
  return m && ELEMENT_SYMBOLS.includes(m[1]) ? m[1] : null;
}
// TASKS.csv #2350 — numbered columns (Au2, Au3, Pd2, Pt2) are repeats or other analyses: decided from the data, not the name. Each one that
// shares at least `minPairs` rows with the element's own value (its main column, else one of its _<digits> method columns) and agrees with
// it (median ratio within 0.8-1.25) is a candidate, offered unticked. -> [{ header, symbol, n, medianRatio }]
export function numberedRepeatCandidates(headers, rows, chosen, { minPairs = 3 } = {}) {
  const out = [];
  const num = (v) => { const n = parseAssayValue(v); return Number.isFinite(n) && n > 0 ? n : null; };
  for (const e of chosen || []) {
    const methodCols = (headers || []).filter((h) => h !== e.header && new RegExp(`^${e.symbol}_\\d+$`).test(String(h).trim()));
    for (const h of headers || []) {
      if (h === e.header || numberedOf(h) !== e.symbol) continue;
      const ratios = [];
      for (const r of rows || []) {
        const rep = num(r[h]); if (rep == null) continue;
        let orig = num(r[e.header]);
        for (let k = 0; orig == null && k < methodCols.length; k++) orig = num(r[methodCols[k]]);
        if (orig != null) ratios.push(rep / orig);
      }
      if (ratios.length < minPairs) continue;
      ratios.sort((a, b) => a - b);
      const med = ratios[ratios.length >> 1];
      if (med >= 0.8 && med <= 1.25) out.push({ header: h, symbol: e.symbol, n: ratios.length, medianRatio: med });
    }
  }
  return out;
}

// TASKS.csv #270 (LOW-1) - elements whose grade is universally quoted in g/t rather than ppm. The two
// units are numerically identical for a solid (g/tonne = mg/kg = ppm), so this only ever changes the
// LABEL next to a cutoff/cap field - but a cutoff typed one order of magnitude out is a real risk, and
// showing the unit the user actually thinks in is the cheapest way to reduce it.
export const PRECIOUS_METALS = new Set(["Au", "Ag", "Pt", "Pd"]);
// TASKS.csv #1680 (review #1645, Copley) — the unit a reader expects to see: a precious metal stored in ppm is labelled g/t (the same
// number), everything else keeps its stored unit. Grade stats, Best intercepts and Compositing said 'Au (ppm)' where Estimation said g/t.
export const gradeUnitLabel = (symbol, unit) => (PRECIOUS_METALS.has(symbol) && (unit || "ppm") === "ppm" ? "g/t" : unit || "ppm");

// TASKS.csv #261 — qualifier handling for censored assay values.
//   "<x"  below detection limit  -> x/2  (half-detection substitution: standard practice)
//   ">x"  OVER-RANGE             -> x    (the detection CEILING, NOT a fabricated multiple of it)
// The ">" branch used to return v * 1.5, inventing 50% of grade in exactly the highest-leverage
// samples in the dataset — a lab reporting ">100 ppm Au" means "this needs a gravimetric re-assay",
// not "150 ppm". x1.5 is not a convention anywhere; reading over-range AT the ceiling is the
// conservative and defensible choice, and the qualifier is now recorded so dataQC.js can tell the user
// these are placeholders rather than letting the substitution stay invisible.
export function parseAssayValue(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  const s = String(raw).trim();
  if (s.startsWith("<")) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : v / 2; }
  if (s.startsWith(">")) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : v; }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

// The qualifier ('<' below detection / '>' over-range / null plain number) that parseAssayValue
// applied, for callers that need to flag a value rather than just use it (dataQC's over-range warning).
export function assayQualifier(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return null;
  const s = String(raw).trim();
  if (s.startsWith("<") && !isNaN(parseFloat(s.slice(1)))) return "<";
  if (s.startsWith(">") && !isNaN(parseFloat(s.slice(1)))) return ">";
  return null;
}

// TASKS.csv #333 — negative assay numbers are never grades: labs and databases use them as codes.
// "-0.005" means "below 0.005" (the detection limit, negated), and -99 / -999 / -9999 mean "not assayed /
// sample lost". Values at or below this threshold are no-data sentinels; values between it and 0 are
// below-detection codes unless the user says otherwise at import.
export const NO_DATA_SENTINEL_MAX = -99;
// TASKS.csv #2336 (review #2325, WA uranium) — "at or below -99" is not enough on its own: P = -100 on 20 rows beside P values of 100-500 ppm
// is the lab's "<100" (as -0.1, -1, -5, -10, -20, -50 are in the same file), and it was read as not assayed. A code at or below -99 is
// no-data when it is all nines (-99, -999, -9999) or bigger than anything the column reports; else it is that column's detection limit.
// posMax: the column's largest positive value (0 / unknown: the fixed threshold alone, as before)
const ALL_NINES = /^9+(\.9+)?$/;
export function isNoDataCode(value, posMax = 0) {
  if (!(value <= NO_DATA_SENTINEL_MAX)) return false;
  const x = -value;
  return ALL_NINES.test(String(x)) || !(posMax > 0) || x > posMax;
}
// raw cell -> { value, qualifier, kind } with negative codes resolved:
//   mode "bdl"     (default) -0.005 -> 0.0025 with qualifier '<' (same half-detection rule as "<0.005")
//   mode "missing"           -0.005 -> not assayed
// kind is "neg_bdl" / "neg_missing" when a negative was converted, so the importer can report counts.
// TASKS.csv #1648 (review #1645, Copley) — some databases write an OVER-limit result as a negative too: Copley's K -10 (">10 %", beside
// 8.4-9.9 % neighbours, column maximum 9.89) and Mn -10000 (">10,000 ppm", maximum 9,447) were read as "<10" = 5 % K and as no-data.
// A code whose size is at or above the column's largest positive value, and no more than twice it, is that column's upper limit.
// #2158 — never -1 or -9: those are no-data codes (4.1 M WAMEX cells), and a gold column topping out at 0.52 read "-1" as ">1 g/t"
export const isOverLimitCode = (value, colMax) => value < 0 && value !== -1 && value !== -9 && colMax > 0 && -value >= colMax && -value <= 2 * colMax;
export function columnPositiveMax(rows, header) {
  let max = 0;
  for (let i = 0; i < (rows || []).length; i++) { const v = parseAssayValue(rows[i][header]); if (v != null && v > max) max = v; }
  return max;
}
// TASKS.csv #2158 (WA drillhole review) — notations with no number: below detection ("< LOD", "<LOD", "<DL", BDL, ND, "<" alone: 6 M
// WAMEX cells) and not assayed (NULL, X, N/L, "-", NA, N/A, NS, NR, LNS / IS: insufficient sample). Both used to read as an unexplained blank.
export const BDL_TEXT = /^(<\s*(lod|l\.o\.d\.?|dl|d\.l\.?|ldl|mdl)?|bdl|b\.d\.l\.?|nd|n\.d\.?|below detection( limit)?)$/i;
export const NOT_ASSAYED_TEXT = /^(null|x|n\/l|-+|na|n\/a|n\.a\.?|ns|n\/s|n\.s\.?|nr|not (analysed|analyzed|assayed|received)|lns|is|nss)$/i;
// #2158 — a column's detection limit, from the lab's own notation: the most common '<x', else the most common small negative code
// (-0.01 = "<0.01", magnitude under 1). -> number or null (the smallest reading is NOT taken here: it is no limit)
export function columnDetectionLimit(cells) {
  const lt = new Map(), neg = new Map();
  for (const raw of cells || []) {
    if (raw == null) continue;
    if (typeof raw === "number") { if (raw < 0 && raw > -1) neg.set(-raw, (neg.get(-raw) || 0) + 1); continue; }
    const s = String(raw).trim();
    if (s.startsWith("<")) { const x = parseFloat(s.slice(1)); if (x > 0) lt.set(x, (lt.get(x) || 0) + 1); continue; }
    const v = parseFloat(s);
    if (v < 0 && v > -1) neg.set(-v, (neg.get(-v) || 0) + 1);
  }
  const top = (m) => { let best = null, n = -1; m.forEach((c, x) => { if (c > n || (c === n && x < best)) { best = x; n = c; } }); return best; };
  return lt.size ? top(lt) : neg.size ? top(neg) : null;
}
// colMax (optional, #1648): the column's largest positive value; a code at that limit -> its size, qualifier '>' (kind "neg_over")
// dl (optional, #2158): the column's detection limit (columnDetectionLimit). A below-detection notation is read at half of it ("txt_bdl"), or
// left blank with no limit to use ("txt_bdl_nodl"); -1 and -9 in a column whose limit is something else are no-data codes, not "<1" / "<9".
// posMax (optional, #2336): the column's largest positive value whatever the over-limit choice, for isNoDataCode
export function readAssayCell(raw, negativeMode = "bdl", colMax = 0, dl = null, posMax = colMax) {
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s && BDL_TEXT.test(s)) return dl > 0 ? { value: dl / 2, qualifier: "<", kind: "txt_bdl" } : { value: null, qualifier: null, kind: "txt_bdl_nodl" };
    if (s && NOT_ASSAYED_TEXT.test(s)) return { value: null, qualifier: null, kind: "na_text" };
  }
  const value = parseAssayValue(raw);
  const qualifier = assayQualifier(raw);
  if (value == null || value >= 0) return { value, qualifier, kind: null };
  if (negativeMode !== "missing" && isOverLimitCode(value, colMax)) return { value: -value, qualifier: ">", kind: "neg_over" };
  if (dl > 0 && (value === -1 || value === -9) && Math.abs(value) !== dl) return { value: null, qualifier: null, kind: "neg_missing" }; // #2158
  if (isNoDataCode(value, posMax) || negativeMode === "missing") return { value: null, qualifier: null, kind: "neg_missing" }; // #2336
  return { value: Math.abs(value) / 2, qualifier: "<", kind: "neg_bdl" };
}

// TASKS.csv #502 — a truly EMPTY cell (not "NA" or another text code, which stay not-assayed). At import the
// user says what an empty cell means for that file: not assayed (default), or below detection.
export const isBlankAssayCell = (raw) => raw == null || (typeof raw === "string" && raw.trim() === "");

// TASKS.csv #502 — the detection limit to give a blank read as below detection, from the column itself: the
// most common '<x' limit the lab reported in it, else the smallest positive value reported (a proxy, said so
// in the notice). null when the column has neither. cells = the raw cells of one element column.
export function blankDetectionLimit(cells) {
  const lt = new Map();
  let minPos = Infinity;
  for (const raw of cells) {
    if (isBlankAssayCell(raw)) continue;
    const s = String(raw).trim();
    if (s.startsWith("<")) { const x = parseFloat(s.slice(1)); if (x > 0) lt.set(x, (lt.get(x) || 0) + 1); continue; }
    const v = typeof raw === "number" ? raw : parseFloat(s);
    if (v > 0 && v < minPos) minPos = v;
  }
  if (lt.size) { let best = null, n = -1; lt.forEach((c, x) => { if (c > n || (c === n && x < best)) { best = x; n = c; } }); return { limit: best, basis: "lt" }; }
  return Number.isFinite(minPos) ? { limit: minPos, basis: "min" } : { limit: null, basis: null };
}

// TASKS.csv #334 — convert a value between ppb / ppm / % (g/t == ppm).
export function convertUnit(v, fromUnit, toUnit) {
  if (v == null || fromUnit === toUnit) return v;
  return fromElementPpm(elementPpm(v, fromUnit), toUnit); // #2487 — an oxide basis ("% Li2O") converts through the element
}

// TASKS.csv #336 — re-importing assays used to append a second copy of every row (a daily camp re-drop
// doubled every intercept metre). An incoming row for the same hole + from + to now MERGES into the
// existing row: its element values overwrite the same elements, and elements it doesn't carry are kept
// (so a later batch that only adds Cu to already-imported Au intervals fills them in rather than
// duplicating them). Rows for new intervals are appended. Returns the merged list and counts.
// TASKS.csv #510 — rows are matched against EARLIER imports only, never against other rows of the same file:
// a file listing an interval twice (field / lab duplicates under the real hole id — 159 pairs in the Harry
// assays) used to merge the pair into one hybrid row (Au from one, Cu from the other) on a first import, and
// the duplicate checks never saw them. Matching is by occurrence: the k-th incoming row of an interval
// updates the k-th existing row of it, so re-importing such a file still replaces rather than duplicates.
// `repeatedInFile` counts the extra same-interval rows in `incoming` (kept, for the notice).
// TASKS.csv #530 — holes whose sample intervals in an incoming file DIFFER from the ones already loaded from the same
// source (a corrected / re-split file: 10-12 m became 10-11.5 + 11.5-12). mergeAssayRows keys on the interval, so
// those used to be ADDED beside the stale row, and intercepts averaged the two (10-12 m @ 4.39 g/t instead of
// 10-11.5 m @ 5). Element top-ups on identical intervals are not listed. QC-marked rows are ignored on both sides.
// Returns [{ hole_id, example }].
export function holesWithChangedIntervals(prev, incoming) {
  // A hole counts only when an interval NEW in the file overlaps an OLD interval the file no longer has (a re-split
  // or a boundary fix). A partial batch on the same boundaries (a re-assay of a few samples) is a top-up, not this.
  const ivKey = (r) => `${r.from}|${r.to}`;
  const groupKey = (r) => `${r.hole_id}|${r.source || ""}`;
  const inc = new Map();
  for (const r of incoming) { if (isMarkedQcRow(r) || !Number.isFinite(r.from) || !Number.isFinite(r.to)) continue; (inc.get(groupKey(r)) || inc.set(groupKey(r), []).get(groupKey(r))).push(r); }
  const old = new Map();
  for (const r of prev || []) { if (isMarkedQcRow(r) || !inc.has(groupKey(r))) continue; (old.get(groupKey(r)) || old.set(groupKey(r), []).get(groupKey(r))).push(r); }
  const out = [];
  for (const [k, oldRows] of old) {
    const newRows = inc.get(k);
    const oldSet = new Set(oldRows.map(ivKey)), newSet = new Set(newRows.map(ivKey));
    const newOnly = newRows.filter((r) => !oldSet.has(ivKey(r)));
    const oldOnly = oldRows.filter((r) => !newSet.has(ivKey(r)));
    const hit = oldOnly.find((o) => newOnly.some((n) => n.from < o.to - 1e-9 && n.to > o.from + 1e-9));
    if (hit) out.push({ hole_id: hit.hole_id, source: hit.source || "", stale: oldOnly.length, example: `${hit.from}–${hit.to} m` });
  }
  return out;
}
// Drops the non-QC rows of these holes (same source) so a corrected file replaces them.
export function dropHoleAssays(prev, holes) {
  const keys = new Set(holes.map((h) => `${h.hole_id}|${h.source}`));
  return (prev || []).filter((r) => isMarkedQcRow(r) || !keys.has(`${r.hole_id}|${r.source || ""}`));
}

export function mergeAssayRows(prev, incoming) {
  // #601 — a row marked as a QC sample keys on its own sample id too: a duplicate shares its original's interval
  // and must never be merged INTO the original (re-importing the same QC sample still merges with itself)
  const key = (r) => `${r.hole_id}|${r.from}|${r.to}|${r.source || ""}${isMarkedQcRow(r) ? `|qc:${r.sample_id || r.sample_type}` : ""}`;
  const out = (prev || []).slice();
  const existing = new Map(); // key -> indices in `out` of the earlier rows, in order
  out.forEach((r, i) => { const k = key(r); if (!existing.has(k)) existing.set(k, []); existing.get(k).push(i); });
  const seen = new Map(); // key -> occurrences so far in `incoming`
  let merged = 0, added = 0, repeatedInFile = 0;
  incoming.forEach((r) => {
    const k = key(r);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    if (n > 0) repeatedInFile++;
    const i = existing.get(k)?.[n];
    if (i == null) { out.push(r); added++; return; }
    const old = out[i];
    const quals = { ...(old.qualifiers || {}) };
    Object.keys(r.values || {}).forEach((sym) => { delete quals[sym]; });
    Object.assign(quals, r.qualifiers || {});
    const next = { ...old, ...r, values: { ...(old.values || {}), ...(r.values || {}) } };
    const files = unionSrcFiles(old.srcFile, r.srcFile); // #624 — a merged interval came from both files
    if (files) next.srcFile = files; else delete next.srcFile;
    if (Object.keys(quals).length) next.qualifiers = quals; else delete next.qualifiers;
    out[i] = next;
    merged++;
  });
  return { rows: out, merged, added, repeatedInFile };
}

// TASKS.csv #624 — which imported file(s) an assay interval came from, so a file can be removed again ("currently
// there is no way to deleted imported assays"). srcFile is the file name, or several joined by a newline when a later
// file merged into the same interval (a file name never contains a newline). Rows from before this have none.
const SRC_SEP = "\n";
export const srcFilesOf = (r) => (r?.srcFile ? String(r.srcFile).split(SRC_SEP) : []);
export function unionSrcFiles(a, b) {
  const set = [...new Set([...(a ? String(a).split(SRC_SEP) : []), ...(b ? String(b).split(SRC_SEP) : [])])];
  return set.length ? set.join(SRC_SEP) : null;
}
// [{ file (null = imported before files were tracked), intervals, shared (also from another file) }], largest first
export function assayFileSummary(assays) {
  const m = new Map();
  (assays || []).forEach((r) => {
    const files = srcFilesOf(r);
    if (!files.length) { const e = m.get(null) || { file: null, intervals: 0, shared: 0 }; e.intervals++; m.set(null, e); return; }
    files.forEach((f) => { const e = m.get(f) || { file: f, intervals: 0, shared: 0 }; e.intervals++; if (files.length > 1) e.shared++; m.set(f, e); });
  });
  return [...m.values()].sort((x, y) => y.intervals - x.intervals);
}
// remove one file's intervals. Intervals that ALSO came from another file are kept (their values can't be separated)
// and lose this file's name; file = null removes the untracked (older) rows.
export function removeAssayFile(assays, file) {
  let removed = 0, keptShared = 0;
  const out = [];
  (assays || []).forEach((r) => {
    const files = srcFilesOf(r);
    if (file == null ? files.length === 0 : files.length === 1 && files[0] === file) { removed++; return; }
    if (file != null && files.length > 1 && files.includes(file)) {
      keptShared++;
      out.push({ ...r, srcFile: files.filter((f) => f !== file).join(SRC_SEP) });
      return;
    }
    out.push(r);
  });
  return { assays: out, removed, keptShared };
}
// remove one element everywhere; intervals left with no element at all are removed too
export function removeAssayElement(assays, symbol) {
  let cleared = 0, emptied = 0;
  const out = [];
  (assays || []).forEach((r) => {
    if (!r.values || !(symbol in r.values)) { out.push(r); return; }
    cleared++;
    const values = { ...r.values }; delete values[symbol];
    const next = { ...r, values };
    if (r.qualifiers && symbol in r.qualifiers) { const q = { ...r.qualifiers }; delete q[symbol]; if (Object.keys(q).length) next.qualifiers = q; else delete next.qualifiers; }
    if (r.valueSources && symbol in r.valueSources) { const v = { ...r.valueSources }; delete v[symbol]; if (Object.keys(v).length) next.valueSources = v; else delete next.valueSources; }
    if (!Object.keys(values).length) { emptied++; return; }
    out.push(next);
  });
  return { assays: out, cleared, emptied };
}

// element wt% -> oxide wt%
const OXIDE_FACTOR = { Na: 1.348, K: 1.205, Mg: 1.658, Ca: 1.399, Fe: 1.2865, Ti: 1.668, Al: 1.889, P: 2.291, Mn: 1.291, Si: 2.1392 };
export function toOxide(elementPct, symbol) { return elementPct == null ? null : elementPct * (OXIDE_FACTOR[symbol] || 1); }

// Normalize a sample's element values to a consistent unit for a symbol.
// values are stored in their native unit (per assayElements), so convert to the needed unit here.
export function valueIn(sample, symbol, unit, elementUnits) {
  const raw = sample.values[symbol];
  if (raw == null) return null;
  const native = elementUnits[symbol] || "ppm";
  if (native === unit) return raw;
  return fromElementPpm(elementPpm(raw, native), unit); // #2487 — "% Li2O" read as "%" is Li %, read as itself is Li2O %
}

// ---------- best-intercept / downhole intersection compositing ----------
// TASKS.csv #132 (Micromine-specialist audit finding): "what are my best Au intercepts >0.5 g/t over
// >3m" currently has no in-app answer — this is the standard exploration-industry "composite" routine
// for it. Per hole, walk the from/to intervals in depth order; every run of above-cutoff samples is
// merged into one composite, allowed to bridge a short run of below-cutoff ("internal dilution")
// material up to maxInternalDilution metres without breaking the intercept — exactly like a geologist
// manually compositing a log by hand, just automated. Below-cutoff rows bridged into a composite keep
// their OWN real assayed grade (not assumed zero), so a wide intercept with a diluting low-grade patch
// inside it reports an honestly diluted grade, not just the grade of the above-cutoff pieces alone.
// TASKS.csv #502 — metres with NO result for the element (a gap between rows — unsampled / lost core — or a
// row where this element was not assayed) are EXCLUDED from the grade, which is length-weighted over the
// assayed metres only, and reported as unsampledM. They used to be counted at zero grade here while
// composites, the "also show" grades and the CSV stamp excluded them: three answers for one blank cell
// (2 / blank / 2 g/t read 1.333 here, 2.0 elsewhere). A blank that really means below detection is set at
// import (the "blank cells mean" option), as '<DL' at half the limit, and then counts like any '<x'.
// TASKS.csv #402 — "including" sub-intercepts, the standard way a drill result is reported
// ("42 m @ 1.2 g/t, including 6 m @ 5.1 g/t"). The high-grade intercepts are computed with exactly the
// same rules at the higher cutoff (same dilution and minimum length, so they are real intercepts in their
// own right, not hand-picked windows) and attached to the parent intercept that contains them, best
// grade x length first. One that only partly overlaps a parent is not attached.
export function attachIncluding(parents, highs) {
  const EPS = 1e-6;
  return parents.map((p) => {
    const inc = highs.filter((h) => h.hole_id === p.hole_id && h.from >= p.from - EPS && h.to <= p.to + EPS && !(Math.abs(h.from - p.from) < EPS && Math.abs(h.to - p.to) < EPS))
      .sort((a, b) => interceptGradeLength(b) - interceptGradeLength(a)); // #2475
    return inc.length ? { ...p, including: inc } : p;
  });
}

// TASKS.csv #2475 (review #2325, WA uranium) — grade x length over the SAMPLED metres: an intercept of 10.40 m with 9.00 m sampled printed
// 1669 x 10.40 = 17,355 (the gaps carried the average grade) and outranked a 6.00 m intercept of 15,761; the samples sum to 15,019
export const interceptSampledM = (r) => Math.max(0, (Number(r?.length) || 0) - (Number(r?.unsampledM) || 0));
export const interceptGradeLength = (r) => (Number(r?.avgGrade) || 0) * interceptSampledM(r);
// TASKS.csv #2608 (review #2486) — an intercept that starts at the hole's first sample or ends at its last sample (or the hole's end) is
// open: its length is a minimum (49 of 60 printed intercepts at 1 % Li2O, a whole 30 m bench hole among them). -> [{ top, bottom }] per row
export function interceptOpenEnds(rows, assays, symbol, collars = []) {
  const first = new Map(), last = new Map(), depth = new Map((collars || []).map((c) => [c.hole_id, Number(c.length)]));
  for (const a of assays || []) {
    if (a?.values?.[symbol] == null) continue;
    const f = Number(a.from), t = Number(a.to);
    if (Number.isFinite(f) && (!first.has(a.hole_id) || f < first.get(a.hole_id))) first.set(a.hole_id, f);
    if (Number.isFinite(t) && (!last.has(a.hole_id) || t > last.get(a.hole_id))) last.set(a.hole_id, t);
  }
  return (rows || []).map((r) => {
    const f0 = first.get(r.hole_id), t1 = last.get(r.hole_id), td = depth.get(r.hole_id);
    return { top: f0 != null && r.from <= f0 + 0.01, bottom: (t1 != null && r.to >= t1 - 0.01) || (td > 0 && r.to >= td - 0.01) };
  });
}
export function computeBestIntercepts(assays, symbol, unit, elementUnits, opts = {}) {
  const cutoff = opts.cutoff ?? 0;
  const maxInternalDilution = opts.maxInternalDilution ?? 2;
  const minLength = opts.minLength ?? 0;
  const EPS = 1e-6;

  const { byHole, stats } = groupAssayRowsByHole(assays);

  const composites = [];
  byHole.forEach((rows, hole_id) => {
    // TASKS.csv #331 — walk non-overlapping depth SEGMENTS, not raw rows: a re-assay overlapping its
    // parent interval, or a double-imported row, used to be counted once per row (0-4 m @ 2 plus a 1-2 m
    // re-assay @ 5 reported "0-2 m @ 6.5"; a duplicated 0-1 m @ 10 plus 1-2 m @ 1 reported "2 m @ 10.5"
    // when the true answer is 5.5). See resolveAssaySegments for how overlaps are resolved.
    const segs = resolveAssaySegments(rows, symbol, unit, elementUnits, stats);
    let current = null; // { from, to, subs: [{from,to,value,width,gt,conflict}], gradeLen, assayedLen }
    let pending = []; // below-cutoff segments seen since the last above-cutoff one, not yet committed
    const startAt = (r, v, width) => ({ from: r.from, to: r.to, subs: [{ from: r.from, to: r.to, value: v, width, gt: r.gt, conflict: r.conflict }], gradeLen: v * width, assayedLen: width });
    const flush = () => {
      if (!current) return;
      const length = current.to - current.from;
      if (length >= minLength - EPS) {
        const unsampled = current.subs.reduce((t, r) => t + (r.unsampled ? r.width : 0), 0);
        composites.push({
          hole_id, from: current.from, to: current.to, length,
          avgGrade: current.assayedLen > 0 ? current.gradeLen / current.assayedLen : 0, // #502 — over assayed metres
          intervals: current.subs.filter((r) => !r.unsampled && r.value != null && r.value >= cutoff && !r.lt).length,
          // TASKS.csv #332 — metres inside the intercept with no result for this element (unsampled core, or
          // not assayed / a negative no-data code); #502: excluded from the grade, reported here.
          unsampledM: unsampled,
          // TASKS.csv #402 — an over-range ('>x', read at its ceiling) sample inside the intercept makes
          // the reported grade a MINIMUM; and metres where overlapping assays were averaged are reported.
          overRange: current.subs.some((r) => r.gt),
          overlapM: current.subs.reduce((t, r) => t + (r.conflict ? r.width : 0), 0),
        });
      }
      current = null; pending = [];
    };
    for (const r of segs) {
      const width = r.to - r.from;
      const v = r.value;
      // TASKS.csv #402 — a '<x' below-detection value is substituted at x/2 for averaging, but it can
      // never make a sample "above cutoff" on its own: the lab said the grade is BELOW x.
      const above = v != null && v >= cutoff && !r.lt;
      if (above) {
        if (current) {
          const gap = r.from - current.to; // total distance to bridge, sampled + unsampled
          const pendingWidth = pending.reduce((t, q) => t + q.width, 0);
          const pendingGrade = pending.reduce((t, q) => t + (q.unsampled ? 0 : (q.value || 0) * q.width), 0);
          const pendingAssayed = pending.reduce((t, q) => t + (q.unsampled ? 0 : q.width), 0);
          // TASKS.csv #332 — a bridge is only taken if the intercept still averages at or above the cutoff
          // afterwards. Chained bridges used to be accepted blindly, so a table headed "0.5 g/t cutoff"
          // could contain "0-7 m @ 0.21 g/t".
          const newAssayed = current.assayedLen + pendingAssayed + width;
          const bridgedAvg = newAssayed > 0 ? (current.gradeLen + pendingGrade + v * width) / newAssayed : 0;
          if (gap <= maxInternalDilution + EPS && bridgedAvg >= cutoff - EPS) {
            pending.forEach((q) => current.subs.push(q));
            const unsampled = gap - pendingWidth;
            if (unsampled > EPS) current.subs.push({ from: current.to + pendingWidth, to: r.from, value: 0, width: unsampled, unsampled: true });
            current.to = r.to;
            current.subs.push({ from: r.from, to: r.to, value: v, width, gt: r.gt, conflict: r.conflict });
            current.gradeLen += pendingGrade + v * width;
            current.assayedLen = newAssayed;
            pending = [];
          } else {
            flush();
            current = startAt(r, v, width);
          }
        } else {
          current = startAt(r, v, width);
        }
      } else if (current) {
        pending.push({ from: r.from, to: r.to, value: v == null ? 0 : v, width, lt: r.lt, gt: r.gt, conflict: r.conflict, unsampled: v == null }); // not assayed for this element: excluded from the grade, reported (#502)
        if (r.to - current.to > maxInternalDilution + EPS) flush(); // already past the bridging allowance
      }
    }
    flush();
  });

  composites.sort((a, b) => interceptGradeLength(b) - interceptGradeLength(a)); // #2475 — over the sampled metres
  // Data-handling counts ride along on the array so the report can say what it did, not just do it.
  composites.stats = stats;
  return composites;
}

// TASKS.csv #331 — shared by the intercept tools. Drops EXACT duplicate rows (same hole, from, to AND
// values — the same rule #286 uses for compositing: two rows over one interval with DIFFERENT results are
// a real conflict, not a double import) and groups the rest by hole.
// TASKS.csv #1579 (review #1497, Lawyers) — an exact duplicate row: the same hole, depths and values. The values' JSON is built only for a
// row that shares its hole and depths with an earlier one: a key of every row's JSON took ~1 s on Lawyers' 83,670 assays (49 elements),
// and the estimation dialog paid it five times on opening.
function duplicateCheck() {
  const seen = new Map(); // "hole|from|to" -> the first row, then the values' JSON of every distinct row there
  return (a) => {
    const k = `${a.hole_id}|${a.from}|${a.to}`;
    const prev = seen.get(k);
    if (prev === undefined) { seen.set(k, a); return false; }
    const list = Array.isArray(prev) ? prev : [JSON.stringify(prev.values ?? null)];
    const j = JSON.stringify(a.values ?? null);
    if (list.includes(j)) return true;
    list.push(j); seen.set(k, list);
    return false;
  };
}
function groupAssayRowsByHole(assays) {
  const byHole = new Map();
  const isDuplicate = duplicateCheck();
  const stats = { duplicatesSkipped: 0, overlappingRows: 0, negativeValues: 0 };
  assays.forEach((a) => {
    if (a.from == null || a.to == null || !(a.to > a.from) || a.hole_id == null) return;
    if (isDuplicate(a)) { stats.duplicatesSkipped++; return; }
    if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []);
    byHole.get(a.hole_id).push(a);
  });
  return { byHole, stats };
}

// TASKS.csv #331/#333 — one hole's rows -> non-overlapping depth segments for one element, so every metre
// is counted exactly once. Where rows overlap (a re-assay inside its parent interval, a mislabelled
// sample) the segment takes the MEAN of the overlapping results and is flagged `conflict`: picking one
// of them would be a silent guess about which result is right, and summing them is what double-counted.
// Negative values are lab/database codes ("-0.005" = below 0.005, -9999 = not assayed), never real
// grades, so they are treated as not assayed here and counted (stats.negativeValues) — an intercept of
// "0-3 m @ -3332 g/t" was the result of averaging one in as a number. Import can convert them properly.
// Segments carry `lt` (every contributing result was '<x') and `gt` (some result was '>x', read at its
// ceiling) from the #261 qualifiers.
function resolveAssaySegments(rows, symbol, unit, elementUnits, stats) {
  const EPS = 1e-6;
  const sorted = rows.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const vals = sorted.map((r) => {
    const v = valueIn(r, symbol, unit, elementUnits);
    if (v != null && v < 0) { if (stats) stats.negativeValues++; return null; }
    return v;
  });
  const bps = Array.from(new Set(sorted.flatMap((r) => [r.from, r.to]))).sort((a, b) => a - b);
  const segs = [];
  const overlapping = new Set();
  let active = [];
  let i = 0;
  for (let k = 0; k < bps.length - 1; k++) {
    const a = bps[k], b = bps[k + 1];
    if (b - a <= EPS) continue;
    while (i < sorted.length && sorted[i].from <= a + EPS) { active.push(i); i++; }
    active = active.filter((j) => sorted[j].to > a + EPS);
    if (!active.length) continue; // unsampled gap — the intercept walk reports it as unsampled metres, outside the grade (#502)
    const withValue = active.filter((j) => vals[j] != null);
    if (active.length > 1) active.forEach((j) => overlapping.add(j));
    const value = withValue.length ? withValue.reduce((t, j) => t + vals[j], 0) / withValue.length : null;
    const qual = (j) => sorted[j].qualifiers?.[symbol];
    segs.push({
      from: a, to: b, value,
      lt: withValue.length > 0 && withValue.every((j) => qual(j) === "<"),
      gt: withValue.some((j) => qual(j) === ">"),
      conflict: withValue.length > 1,
    });
  }
  if (stats) stats.overlappingRows += overlapping.size;
  return segs;
}

// TASKS.csv #571 — the RAW (non-composited) sample intervals for estimation and grade shells. Those paths mapped
// every assay row straight to a sample point, so an exact double import, or a re-assay over its parent interval,
// became two co-located samples (double weight in IDW / kriging). Now the same rules as compositing and the
// intercept tools: exact duplicates dropped (#286 / #331), overlapping rows resolved into non-overlapping
// segments carrying the mean of the overlapping results (flagged `conflict`), negative lab codes treated as not
// assayed (they used to be clamped to 0 downstream), values read through valueIn like compositing.
// capValue: high-grade cap per segment, like the raw path before. Returns { intervals, stats }.
export function rawSampleIntervals(assays, symbol, unit, elementUnits, { capValue = null } = {}) {
  const { byHole, stats } = groupAssayRowsByHole(assays || []);
  const intervals = [];
  byHole.forEach((rows, hole_id) => {
    resolveAssaySegments(rows, symbol, unit, elementUnits, stats).forEach((s) => {
      if (s.value == null) return;
      const avgGrade = capValue != null && s.value > capValue ? capValue : s.value;
      intervals.push({ hole_id, from: s.from, to: s.to, avgGrade, ...(s.conflict ? { conflict: true } : {}) });
    });
  });
  return { intervals, stats };
}

// TASKS.csv #230 (Micromine/mineral-exploration/Leapfrog-specialist audit finding) — best-intercept
// reporting only ever showed ONE element (whichever the intercept was composited against), with no way
// to see what a second/third element graded over that SAME depth window (e.g. "what's the Ag and Cu
// over this Au intercept?" — a routine question in a polymetallic system). Rather than re-running the
// whole compositing/cutoff/dilution logic per extra element (which would produce a DIFFERENT set of
// break points per element — not what's wanted here), this just length-weight-averages a chosen
// element's raw assay values over an ALREADY-COMPOSITED interval's fixed from/to window, the same
// weighting computeBestIntercepts itself uses. Below-detection substitution/unit conversion goes
// through the same valueIn() every other grade figure in this file uses. Returns null (not 0) if no
// assay row for this element overlaps the window at all, so the caller can render "—" rather than a
// misleading zero.
// TASKS.csv #230 — per-intercept domain/lithology breakdown, the last sub-item of the three-audit
// finding on intercept reporting. Answers "what is this intercept actually hosted in?" — which is a
// different and often more important question than its grade: an 8 m intercept sitting entirely
// inside one rhyolite unit means something quite different from the same 8 m straddling a contact
// between two units, and a report that can't distinguish those hides real geology.
//
// Returns every domain row overlapping the interval with the METRES of overlap and the fraction of
// the interval it accounts for, sorted longest-first, so the caller can show either the dominant
// host (parts[0]) or the full breakdown. Overlap is length-weighted exactly the way avgGradeInRange
// below and computeBestIntercepts above already weight things, so all three agree about what "how
// much of this interval" means.
//
// `domainRows` is any interval layer in this app's standard shape ([{hole_id, from, to, value}]) —
// lithology is the obvious one, but alteration/vein/any custom interval layer works identically,
// which is why this takes rows rather than hard-coding `litho`.
export function domainsForInterval(domainRows, hole_id, from, to) {
  const EPS = 1e-6;
  const width = to - from;
  if (!(width > EPS)) return { parts: [], dominant: null, covered: 0, overlapping: false };
  const byValue = new Map();
  const spans = [];
  let summed = 0;
  (domainRows || []).forEach((d) => {
    if (d.hole_id !== hole_id || d.from == null || d.to == null || d.to <= d.from) return;
    const ovFrom = Math.max(d.from, from), ovTo = Math.min(d.to, to);
    const ov = ovTo - ovFrom;
    if (ov <= EPS) return;
    const key = String(d.value ?? "").trim() || "(unlabelled)";
    byValue.set(key, (byValue.get(key) || 0) + ov);
    spans.push([ovFrom, ovTo]);
    summed += ov;
  });
  // Real coverage is the UNION of the overlapping spans, not their sum. Discovered while verifying
  // this against the real harry_property lithology log, which genuinely contains overlapping
  // intervals (45.50-62.00 FINT and 49.00-62.00 DACT overlap by 13 m). Summing gave "covered" > 1 and
  // per-unit fractions that added to 150%, which reads as a broken report. Overlapping logs are a
  // real data-quality problem — from bad merges, re-logging, or a sloppy export — so this measures
  // coverage correctly AND flags the overlap rather than silently normalising it away, since the
  // geologist needs to know their log has a genuine conflict here.
  spans.sort((a, b) => a[0] - b[0]);
  let union = 0, curStart = null, curEnd = null;
  spans.forEach(([s, e]) => {
    if (curStart === null) { curStart = s; curEnd = e; return; }
    if (s <= curEnd + EPS) { curEnd = Math.max(curEnd, e); }
    else { union += curEnd - curStart; curStart = s; curEnd = e; }
  });
  if (curStart !== null) union += curEnd - curStart;

  const parts = Array.from(byValue.entries())
    .map(([value, metres]) => ({ value, metres, fraction: metres / width }))
    .sort((a, b) => b.metres - a.metres);
  return {
    parts,
    dominant: parts.length ? parts[0] : null,
    // Fraction of the interval covered by ANY domain row. Reported separately from the parts
    // themselves: a dominant unit at 100% of the COVERED length is misleading if the log only covers
    // half the intercept, and the caller needs to be able to say so rather than implying full
    // knowledge from partial logging.
    covered: Math.min(1, union / width),
    // True when the source rows overlap each other within this interval, i.e. the same metre is
    // logged as more than one unit — in which case the per-unit fractions legitimately sum above 100%
    // and the caller should say so rather than presenting them as a clean split.
    overlapping: summed > union + EPS,
  };
}

export function avgGradeInRange(assays, hole_id, from, to, symbol, unit, elementUnits) {
  return makeRangeAverager(assays.filter((a) => a.hole_id === hole_id), elementUnits)(hole_id, from, to, symbol, unit);
}

// TASKS.csv #504 — the same average for MANY windows over one assay table (Best Intercepts' "also show"
// columns: one call per intercept per extra element). avgGradeInRange filtered the whole table, de-duplicated
// and re-resolved the hole's segments on every call — O(intercepts x all assays): 845 ms on the 37-hole
// Harry sample with three extras, 23 s at 63k rows, re-run on every keystroke in the cutoff box. Here the
// table is grouped by hole ONCE (same #331 duplicate rule), each hole's segments are resolved once per
// element and unit (same resolveAssaySegments), and a window is a binary search plus a short sum. Same
// numbers as avgGradeInRange (test/geochem.test.mjs compares them).
export function makeRangeAverager(assays, elementUnits) {
  const EPS = 1e-6;
  const { byHole } = groupAssayRowsByHole(assays);
  const cache = new Map(); // `${hole}|${symbol}|${unit}` -> segments sorted by depth
  return (hole_id, from, to, symbol, unit) => {
    const rows = byHole.get(hole_id);
    if (!rows) return null;
    const k = `${hole_id}|${symbol}|${unit}`;
    let segs = cache.get(k);
    if (!segs) { segs = resolveAssaySegments(rows, symbol, unit, elementUnits, null); cache.set(k, segs); }
    let lo = 0, hi = segs.length; // first segment ending after `from`
    while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].to <= from + EPS) lo = m + 1; else hi = m; }
    let weighted = 0, coveredWidth = 0;
    for (let i = lo; i < segs.length && segs[i].from < to - EPS; i++) {
      const sg = segs[i];
      if (sg.value == null) continue;
      const overlap = Math.min(sg.to, to) - Math.max(sg.from, from);
      if (overlap <= EPS) continue;
      weighted += sg.value * overlap;
      coveredWidth += overlap;
    }
    return coveredWidth <= EPS ? null : weighted / coveredWidth;
  };
}

// ---------- fixed-length downhole compositing ----------
// TASKS.csv #118 (Micromine/Leapfrog-specialist audit finding): the standard pre-estimation step —
// raw sample intervals are almost never a convenient regular length for variography/block-model
// estimation, so they're composited to a fixed length (1m/2m/5m/etc) first. Two things a naive
// "just chop into N-metre chunks" implementation gets wrong, both handled here:
//  1. Domain honoring — a composite must not straddle a domain boundary (e.g. half in one lithology,
//     half in another), because that would blend grade across a geological contact that the estimation
//     step is supposed to respect. Domain rows (optional) force a composite break at every boundary,
//     so composite length is capped at `length` but can be shorter right at a domain change.
//  2. High-grade capping — an optional per-sample cap is applied to each RAW sample's grade before
//     it's folded into any composite average, matching how Micromine/Leapfrog cap outliers prior to
//     compositing (capping the composite average after the fact would still let one wildly anomalous
//     thin sample dominate a thick composite; capping per-sample is the industry-standard order).
// Each composite's grade is length-weighted across whatever raw sample material actually falls inside
// it (like computeBestIntercepts, above) — a composite interval only partially covered by real assay
// data is still reported, but flagged via `coverage` (fraction 0..1) so a low-coverage composite (e.g.
// a metre of missing/lost core) can be filtered out downstream rather than silently treated as a full
// real sample.
// TASKS.csv #286 — the same "exact duplicate" test compositeDownhole applies internally, exposed so
// the compositing UI can TELL the user their input had duplicates rather than silently fixing it
// behind their back (the finding's "or at minimum warn in the compositing UI"; this does both).
// Counts rows dropped as exact duplicates, and separately the (hole_id, from, to) intervals that
// appear more than once with DIFFERENT results — those are conflicts compositing deliberately does
// NOT resolve, and they're the ones worth going back to the source data for.
// TASKS.csv #737 — exact-duplicate test without stringifying every row: the values payload is compared only when
// (hole_id, from, to) repeats. JSON.stringify of each row's values was 60-90 % of compositing time (60,000 x 49
// elements: 713 of 795 ms), for the ~0.1 % of rows that ever share an interval. Same answers as the full key.
// Returns a function row -> "new" | "duplicate" (same interval, same values) | "conflict" (same interval, other values).
function intervalDuplicateTracker() {
  const seen = new Map(); // "hole|from|to" -> the first row, then a Set of the values strings seen there
  return (a) => {
    const iv = `${a.hole_id}|${a.from}|${a.to}`;
    let prev = seen.get(iv);
    if (prev === undefined) { seen.set(iv, a); return "new"; }
    if (!(prev instanceof Set)) { prev = new Set([JSON.stringify(prev.values ?? null)]); seen.set(iv, prev); }
    const v = JSON.stringify(a.values ?? null);
    if (prev.has(v)) return "duplicate";
    prev.add(v);
    return "conflict";
  };
}

export function countDuplicateAssayIntervals(assays) {
  const track = intervalDuplicateTracker();
  let exactDuplicates = 0;
  const conflicting = new Set();
  (assays || []).forEach((a) => {
    if (a.from == null || a.to == null || a.to <= a.from || a.hole_id == null) return;
    const seen = track(a);
    if (seen === "duplicate") exactDuplicates++;
    else if (seen === "conflict") conflicting.add(`${a.hole_id}|${a.from}|${a.to}`);
  });
  return { exactDuplicates, conflictingIntervals: conflicting.size };
}

export function compositeDownhole(assays, symbol, unit, elementUnits, opts = {}) {
  const length = opts.length ?? 2;
  const minCoverage = opts.minCoverage ?? 0.5;
  const capValue = opts.capValue ?? null;
  const domainRows = opts.domainRows ?? null; // [{hole_id, from, to, value}] | null — e.g. a litho layer
  // TASKS.csv #1571 — a cap per domain value ({ value: cap }); a composite never spans two domains, so its domain's cap applies, else capValue
  const capByDomain = opts.capByDomain && domainRows ? opts.capByDomain : null;
  const EPS = 1e-6;
  if (length <= 0) return [];

  const byHole = new Map();
  // TASKS.csv #286 (Micromine-specialist review) — exact-duplicate raw intervals are dropped BEFORE
  // any length-weighting. dataQC.js's validateAssays already flags "Duplicate assay interval X–Ym —
  // likely imported twice" as a real, acknowledged occurrence, but compositing itself had no defense
  // if the user composited before cleaning it up: the `overlapping.forEach` loop below sums EVERY
  // overlapping row, so a doubled row contributed its grade and its length twice. That doesn't just
  // double a number — it silently re-weights the composite toward whichever interval happened to be
  // duplicated (worked case verified for TASKS.csv #286: a duplicated high-grade metre pulls a 2 m
  // composite from 5.5 to 7.0 g/t), which then flows straight into an estimation input.
  //
  // "Exact duplicate" deliberately includes the values payload, not just (hole_id, from, to): two rows
  // over the same interval with DIFFERENT results are a genuine data conflict (a re-assay, a mislabeled
  // sample), not a double-import, and silently discarding one of them would be its own quiet data loss.
  // Those are left alone and stay dataQC's business to report.
  // (CompositingModal reports the count itself, via countDuplicateAssayIntervals.)
  const track = intervalDuplicateTracker(); // #737 — values compared only when the interval repeats
  assays.forEach((a) => {
    if (a.from == null || a.to == null || a.to <= a.from || a.hole_id == null) return;
    if (track(a) === "duplicate") return;
    if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []);
    byHole.get(a.hole_id).push(a);
  });

  const domainByHole = new Map();
  if (domainRows) {
    domainRows.forEach((d) => {
      if (d.from == null || d.to == null || d.to <= d.from || d.hole_id == null) return;
      if (!domainByHole.has(d.hole_id)) domainByHole.set(d.hole_id, []);
      domainByHole.get(d.hole_id).push(d);
    });
    domainByHole.forEach((rows) => rows.sort((a, b) => a.from - b.from));
  }

  // domain value covering depth d in this hole's domain rows (or null if unsampled/undefined there)
  function domainAt(domRows, d) {
    if (!domRows) return null;
    const hit = domRows.find((r) => d >= r.from - EPS && d < r.to - EPS);
    return hit ? hit.value : null;
  }

  const composites = [];
  byHole.forEach((rows, hole_id) => {
    const sorted = rows.slice().sort((a, b) => a.from - b.from);
    const segs = resolveAssaySegments(sorted, symbol, unit, elementUnits, null); // #532
    let segIdx = 0;
    const holeStart = sorted[0].from;
    const holeEnd = sorted.reduce((m, r) => Math.max(m, r.to), sorted[0].to);
    const domRows = domainByHole.get(hole_id) || null;

    // build the list of break points: every domain boundary inside the hole's sampled range (both the
    // start and end of each domain row — a boundary is wherever the domain value changes, so
    // registering both edges naturally captures that even where two domain rows aren't perfectly
    // adjacent), then fixed-length steps RE-ANCHORED at each of those boundaries.
    //
    // TASKS.csv #262 — the fixed-length grid used to run continuously from holeStart and simply get
    // chopped by each domain edge, which strands a short residual on BOTH sides of every contact
    // (length=2 with a contact at 3 m gave 2.0, 1.0, 1.0, 2.0 …). Re-anchoring means each domain
    // interval is composited from its own top, so the only short composite in a domain is the last one
    // at its base — the standard downhole-compositing convention, and it roughly halves the number of
    // short-support composites sitting exactly on the contacts that matter most.
    const round6 = (d) => Math.round(d * 1e6) / 1e6;
    const anchors = new Set([holeStart, holeEnd]);
    if (domRows) domRows.forEach((r) => {
      if (r.from > holeStart + EPS && r.from < holeEnd - EPS) anchors.add(round6(r.from));
      if (r.to > holeStart + EPS && r.to < holeEnd - EPS) anchors.add(round6(r.to));
    });
    const sortedAnchors = Array.from(anchors).sort((a, b) => a - b);
    const breaks = new Set(sortedAnchors);
    for (let a = 0; a < sortedAnchors.length - 1; a++) {
      const segStart = sortedAnchors[a], segEnd = sortedAnchors[a + 1];
      for (let d = segStart + length; d < segEnd - EPS; d += length) breaks.add(round6(d));
    }
    const sortedBreaks = Array.from(breaks).filter((d) => d >= holeStart - EPS && d <= holeEnd + EPS).sort((a, b) => a - b);

    for (let i = 0; i < sortedBreaks.length - 1; i++) {
      let from = sortedBreaks[i], to = sortedBreaks[i + 1];
      if (to - from <= EPS) continue;
      // a segment between two consecutive fixed-length/domain breaks can still be longer than `length`
      // if no domain break fell inside it (the fixed-length breaks already prevent that in practice,
      // but guard anyway) — clip to `length` from `from` if so.
      if (to - from > length + EPS) to = from + length;

      // TASKS.csv #532 — from the hole's resolved segments (resolveAssaySegments, as intercepts since #331): every metre
      // counted once, conflicting results averaged and their metres reported. Summing every overlapping row counted
      // a re-assay's metre twice: rows 0-1 @10 and 0-1 @6, no core 1-2 -> composite 0-2 had coverage 1.0 and passed
      // any minCoverage with 1 of 2 m sampled.
      while (segIdx < segs.length && segs[segIdx].to <= from + EPS) segIdx++;
      let gradeLen = 0, coveredLen = 0, conflictLen = 0;
      const dHere = domRows ? domainAt(domRows, (from + to) / 2) : null;
      const capHere = capByDomain && dHere != null && Number(capByDomain[String(dHere)]) > 0 ? Number(capByDomain[String(dHere)]) : capValue; // #1571
      for (let k = segIdx; k < segs.length && segs[k].from < to - EPS; k++) {
        const g = segs[k];
        const ov = Math.min(g.to, to) - Math.max(g.from, from);
        if (ov <= EPS || g.value == null) continue;
        const v = capHere != null && g.value > capHere ? capHere : g.value;
        gradeLen += v * ov;
        coveredLen += ov;
        if (g.conflict) conflictLen += ov;
      }
      const segLen = to - from;
      const coverage = segLen > 0 ? Math.min(1, coveredLen / segLen) : 0;
      if (coverage < minCoverage - EPS) continue; // too little real sample material in this segment
      // TASKS.csv #657 — a window with NO assayed material is not a composite at any minCoverage: at 0 % it used to be
      // kept with grade 0 and coverage 0 (Harry Au, 2 m: 2,402 of 6,362 composites), and those zeros fed estimates,
      // grade shells, the variogram and the composite CSV.
      if (coveredLen <= EPS) continue;
      // Note: avgGrade is length-weighted across the COVERED material only (gradeLen / coveredLen),
      // not diluted by treating the uncovered remainder as zero grade — unlike computeBestIntercepts'
      // internal-dilution bridging above, an uncovered stretch here means "no data" (lost core, gap in
      // sampling), not "assayed and genuinely low-grade", so folding it in as a zero would understate
      // the composite. `coverage` is reported alongside so a caller can filter/flag thin-data composites
      // instead of having that silently baked into the grade number.
      composites.push({
        hole_id, from, to, length: segLen,
        avgGrade: coveredLen > 0 ? gradeLen / coveredLen : 0,
        coverage,
        conflictLength: conflictLen, // #532 — metres where overlapping rows disagreed (averaged)
        domain: domRows ? domainAt(domRows, (from + to) / 2) : null,
      });
    }
  });

  composites.sort((a, b) => (a.hole_id < b.hole_id ? -1 : a.hole_id > b.hole_id ? 1 : a.from - b.from));
  return composites;
}

// ---------- TASKS.csv #533 — capping audit ----------
// A cap value means nothing to a reviewer without the standard figures: how many samples it cut and what share of the
// metal (grade x length) it removed. Both are measured on the RAW samples the cap is applied to (compositeDownhole caps
// each raw sample before averaging), as resolved segments (#331: overlapping rows counted once, negative lab codes not
// assayed, exact duplicate rows dropped), so the figures match what compositing / estimation actually used.
// TASKS.csv #1099 — exported for Grade Statistics, so the panel where cap values are chosen counts the same samples as
// the cap audit, compositing and estimation (Harry: 3,740 raw Au rows, 3,648 resolved samples). -> [{ hole_id, from, to, value }]
// #1579 — cached per assay list (the same array: a new import or filter is a new array) and element: the cap buttons, the audit, its
// warning and the dialog's automatic P99 read the same segments. Frozen: callers read them.
const segmentCache = new WeakMap(); // assays -> Map("symbol|unit|native unit" -> { segs, byValue, total })
function segmentSummary(assays, symbol, unit, elementUnits) {
  const list = assays || [];
  let m = segmentCache.get(list);
  if (!m) segmentCache.set(list, (m = new Map()));
  const key = `${symbol}|${unit}|${elementUnits?.[symbol] || "ppm"}`;
  let hit = m.get(key);
  if (hit) return hit;
  const byHole = new Map(), isDuplicate = duplicateCheck();
  list.forEach((a) => {
    if (a.from == null || a.to == null || a.to <= a.from || a.hole_id == null) return;
    if (isDuplicate(a)) return;
    let arr = byHole.get(a.hole_id);
    if (!arr) byHole.set(a.hole_id, (arr = []));
    arr.push(a);
  });
  const segs = [];
  byHole.forEach((rows, hole_id) => resolveAssaySegments(rows, symbol, unit, elementUnits, null).forEach((s) => { if (s.value != null && s.to > s.from) segs.push(Object.freeze({ hole_id, from: s.from, to: s.to, value: s.value, lt: !!s.lt })); })); // lt: #2505
  const byValue = segs.map((s) => ({ value: s.value, len: s.to - s.from })).sort((a, b) => a.value - b.value);
  hit = { segs: Object.freeze(segs), byValue, total: byValue.reduce((t, x) => t + x.len, 0) };
  m.set(key, hit);
  return hit;
}
export function resolvedSegments(assays, symbol, unit, elementUnits) {
  return segmentSummary(assays, symbol, unit, elementUnits).segs;
}
export function capAudit(assays, symbol, unit, elementUnits, capValue) {
  const segs = segmentSummary(assays, symbol, unit, elementUnits).byValue;
  let metalBefore = 0, metalAfter = 0, nCapped = 0, lenCapped = 0;
  for (const s of segs) {
    metalBefore += s.value * s.len;
    const capped = capValue != null && s.value > capValue;
    if (capped) { nCapped++; lenCapped += s.len; }
    metalAfter += (capped ? capValue : s.value) * s.len;
  }
  const nSamples = segs.length;
  return {
    capValue: capValue ?? null, nSamples, nCapped, lenCapped,
    pctCapped: nSamples ? (100 * nCapped) / nSamples : 0,
    metalBefore, metalAfter, pctMetalRemoved: metalBefore > 0 ? (100 * (metalBefore - metalAfter)) / metalBefore : 0,
  };
}
// the grade below which p% of the sampled LENGTH lies (a 10 m sample counts ten times a 1 m one) — what "cap at the
// 97.5th percentile" means for unequal sample lengths. null when nothing is assayed.
export function lengthWeightedPercentile(assays, symbol, unit, elementUnits, p) {
  const { byValue: segs, total } = segmentSummary(assays, symbol, unit, elementUnits);
  if (!total) return null;
  const target = (p / 100) * total;
  let acc = 0;
  for (const s of segs) { acc += s.len; if (acc >= target - 1e-9) return s.value; }
  return segs[segs.length - 1].value;
}
export function capAuditText(a, unitLabel = "") {
  if (!a || a.capValue == null) return "";
  return tr("cap {capValue}{v}: {nCapped} of {nSamples} samples capped ({pctCapped}%), {pctMetalRemoved}% of the metal (grade x length) removed", { capValue: a.capValue, v: unitLabel ? ` ${unitLabel}` : "", nCapped: a.nCapped, nSamples: a.nSamples, pctCapped: a.pctCapped.toFixed(1), pctMetalRemoved: a.pctMetalRemoved.toFixed(1) });
}





// TASKS.csv #402 — metal equivalent grade, ONLY from prices and recoveries the user enters (never
// defaults: an equivalent grade is only as meaningful as its assumptions, and they must be stated).
// Precious metals (Au, Ag, Pt, Pd) are priced per troy ounce, everything else per pound. Grades are read
// in g/t (ppm); % is converted (1 % = 10,000 g/t); ppb divided by 1,000.
//   value per tonne = sum_i( grade_i[g/t] * price_i[$/g] * recovery_i )
//   equivalent grade (in the base element's own unit) = value per tonne / (price_base[$/g] * recovery_base)
// `metals`: [{ symbol, unit, price, recovery (0-1) }], the base element first. Returns null if any input is
// missing, so a partial set can never print a number.
const G_PER_OZT = 31.1034768, G_PER_LB = 453.59237;
export function pricePerGram(symbol, price) {
  return PRECIOUS_METALS.has(symbol) ? price / G_PER_OZT : price / G_PER_LB;
}
function toGt(value, unit) { return elementPpm(value, unit); } // #2487 — g/t of the element (the prices are per unit of the element)
export function metalEquivalent(grades, metals) {
  if (!metals?.length) return null;
  let value = 0;
  for (const m of metals) {
    const g = grades[m.symbol];
    if (!(Number.isFinite(g) && Number.isFinite(m.price) && m.price > 0 && Number.isFinite(m.recovery) && m.recovery > 0 && m.recovery <= 1)) return null;
    value += toGt(g, m.unit) * pricePerGram(m.symbol, m.price) * m.recovery;
  }
  const base = metals[0];
  const eqGt = value / (pricePerGram(base.symbol, base.price) * base.recovery);
  return fromElementPpm(eqGt, base.unit);
}
// TASKS.csv #1387 (review #1352, Silvertip) — the assay rows with a per-sample metal equivalent as a virtual element `${base}Eq` (in
// the base element's unit), so intercepts can be cut on the equivalent with the same cutoff / dilution / length rules: a Zn-rich,
// Ag-poor zone is found by an AgEq report and never by an Ag one. A sample missing any of the metals (or with a negative code) has no
// equivalent: unassayed for it, left out of the grade as #502 does. A '>' result on any metal makes the sample's equivalent a minimum
// ('>'); it reads '<' only when every metal was below detection. -> { rows, symbol, units }
export function withMetalEquivalent(assays, metals, elementUnits) {
  const base = metals[0], symbol = `${base.symbol}Eq`;
  const rows = assays.map((r) => {
    const grades = {};
    let gt = false, allLt = true;
    for (const m of metals) {
      const v = valueIn(r, m.symbol, m.unit, elementUnits);
      grades[m.symbol] = v != null && v >= 0 ? v : NaN;
      const q = r.qualifiers?.[m.symbol];
      if (q === ">") gt = true;
      if (q !== "<") allLt = false;
    }
    const eq = metalEquivalent(grades, metals);
    const q = eq == null ? undefined : gt ? ">" : allLt ? "<" : undefined;
    return { ...r, values: { ...r.values, [symbol]: eq }, qualifiers: q ? { ...(r.qualifiers || {}), [symbol]: q } : r.qualifiers };
  });
  return { rows, symbol, units: { ...elementUnits, [symbol]: base.unit } };
}

export function metalEquivalentFormula(metals) {
  const b = metals[0];
  const per = (s) => (PRECIOUS_METALS.has(s) ? "/oz" : "/lb");
  return `${b.symbol}Eq = ${metals.map((m) => `${m.symbol} x ${m.symbol === b.symbol ? "1" : `(${m.price}${per(m.symbol)} x ${Math.round(m.recovery * 100)}%) / (${b.price}${per(b.symbol)} x ${Math.round(b.recovery * 100)}%)${m.unit !== b.unit ? ` [${m.unit} -> ${b.unit}]` : ""}`}`).join(" + ")}`;
}

// TASKS.csv #841 — the descriptive columns of a surface-sample file (horizon, landform, lab, year, sample type...) are
// kept on each sample as `attrs`, so thresholds and backgrounds can be judged per population. Kept: every column that
// is not mapped (x / y / z / id / medium) and not an element column, whose non-empty values have at most
// SURFACE_ATTR_MAX_DISTINCT distinct entries (categories, not running numbers, comments or coordinates); text is cut
// to 60 characters.
export const SURFACE_ATTR_MAX_DISTINCT = 100;
export const SURFACE_ATTR_MAX_CHARS = 500; // TASKS.csv #1822
// TASKS.csv #1822 — a free-text column (a description, a comment) has as many distinct values as rows; it is kept whole for Identify
export const isFreeTextHeader = (h) => /desc|comment|note|remark|observ/i.test(String(h || ""));
export function surfaceAttrColumns(headers, rows, mapping = {}, elements = []) {
  const mapped = new Set(Object.values(mapping || {}).filter(Boolean));
  const elementCols = new Set();
  (elements || []).forEach((e) => { [e.header, e.mainHeader, e.overLimit?.header].forEach((h) => h && elementCols.add(h)); });
  return (headers || []).filter((h) => {
    if (!h || mapped.has(h) || elementCols.has(h)) return false;
    const seen = new Set();
    for (const r of rows) {
      const v = r[h];
      if (v == null || String(v).trim() === "") continue;
      seen.add(String(v).trim());
      if (seen.size > SURFACE_ATTR_MAX_DISTINCT && !isFreeTextHeader(h)) return false; // free text: #1822
    }
    return seen.size > 0;
  });
}
// TASKS.csv #1509 — Papa's dynamic typing reads an ISO timestamp cell ('2021-06-05T00:00:00.000Z') as a Date, and String(Date) is the
// computer's LOCAL time: 'Fri Jun 04 2021 16:00:00 GMT-0800' in BC, the day before. A date at UTC midnight is kept as 'yyyy-mm-dd',
// any other moment as the ISO text; whatever the computer's time zone.
export function attrText(v) {
  if (v instanceof Date) { if (Number.isNaN(v.getTime())) return ""; const iso = v.toISOString(); return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso; }
  return v == null ? "" : String(v).trim();
}
export function surfaceAttrs(row, cols) {
  const attrs = {};
  // #1822: a field note is read whole in Identify (was 60 characters); TASKS.csv #1828 — the key on one line (an Excel header 'Digest_Run NA \r\nPb-OG62')
  cols.forEach((h) => { const t = attrText(row[h]); if (t !== "") attrs[String(h).replace(/\s+/g, " ").trim()] = t.slice(0, SURFACE_ATTR_MAX_CHARS); });
  return Object.keys(attrs).length ? { attrs } : {};
}

// TASKS.csv #954 — a surface import merges onto the samples already in the project by (sample_id, medium), as drillhole
// assays merge on hole / from / to (#336): repeat public pulls (two overlapping BC RGS boxes, adjacent USGS quads, a
// CDoGS survey's ICP-MS then INAA package) return the same sites, which used to be appended and counted twice in the
// thresholds, catchments, evidence overlay and QC. The new row's values, flags, position and attributes win; an element
// only the old row has is kept. Rows without an id are always added, and an import's own repeated ids are left as the
// file has them (not merged with each other). -> { samples, updated, added }
// TASKS.csv #1794 (review #1646, Kodiak) — a numeric id matches without its leading zeros: Excel dropped them in Kodiak's soil data sheet
// ('45601') but not in its assay sheet ('045601'), and the join added 135 duplicate sites at the same coordinates.
export const sampleIdKey = (id) => { const t = String(id ?? "").trim(); return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t; };
// TASKS.csv #2085 (review #2013, Surface Geology) — a re-import of the same soil ids with the medium set to 'rock chip' made 49 duplicates at the
// same coordinates: the merge key is id + medium, so a wrong medium slipped past it with no word. -> the incoming rows whose sample id is
// already in the project under ANOTHER medium within tol metres: { n, media: { medium: count }, existing: Map(row -> its medium) }.
export function otherMediumTwins(prev, rows, tol = 1) {
  const byId = new Map();
  for (const s of prev || []) { if (!s?.sample_id) continue; const k = sampleIdKey(s.sample_id); if (!byId.has(k)) byId.set(k, []); byId.get(k).push(s); }
  const existing = new Map(), media = {};
  for (const r of rows || []) {
    if (!r?.sample_id) continue;
    const same = (byId.get(sampleIdKey(r.sample_id)) || []);
    if (same.some((s) => s.medium === r.medium)) continue; // an ordinary update
    const twin = same.find((s) => Math.hypot(s.x - r.x, s.y - r.y) <= tol);
    if (twin) { existing.set(r, twin.medium); media[twin.medium] = (media[twin.medium] || 0) + 1; }
  }
  return { n: existing.size, media, existing };
}
export function mergeSurfaceSamples(prev, rows) {
  const keyOf = (s) => (s.sample_id ? `${sampleIdKey(s.sample_id)}\u0000${s.medium}` : null);
  const at = new Map();
  prev.forEach((s, i) => { const k = keyOf(s); if (k && !at.has(k)) at.set(k, i); });
  const samples = prev.slice();
  let updated = 0, added = 0;
  for (const b of rows) {
    const i = at.get(keyOf(b));
    if (i == null) { samples.push(b); added++; continue; }
    const a = samples[i];
    const values = { ...a.values, ...b.values };
    const fresh = (sym) => b.values?.[sym] != null || b.nd?.includes(sym); // the new row reports this element
    const bdl = [...(a.bdl || []).filter((s) => !fresh(s)), ...(b.bdl || [])];
    const nd = [...new Set([...(a.nd || []).filter((s) => !fresh(s)), ...(b.nd || [])])].filter((s) => values[s] == null);
    const attrs = { ...a.attrs, ...b.attrs };
    const m = { ...a, ...b, z: b.z ?? a.z, values };
    delete m.bdl; delete m.nd; delete m.attrs;
    samples[i] = { ...m, ...(bdl.length ? { bdl } : {}), ...(nd.length ? { nd } : {}), ...(Object.keys(attrs).length ? { attrs } : {}) };
    updated++;
  }
  return { samples, updated, added };
}

// TASKS.csv #1016 (review: drillhole-db, Micromine user, exploration geologist) — the "Assays CSV" export, re-importable:
// it wrote bare element headers (Au ppb read back as ppm, x1000), the stored half-limit number instead of "<0.005" (read
// back as a measured 0.0025), and dropped sample_id / sample_type / parent_id / qc_code (standards and blanks came back
// as ordinary intervals). Now each element column carries its unit (Au_ppb, Cu_pct, Au_ppm), a below-detection value
// is written "<limit" and an over-range one ">limit" as labs write them, and the sample / QC columns are kept.
const UNIT_TAG = { ppb: "ppb", ppm: "ppm", "%": "pct", "g/t": "gpt", gpt: "gpt" };
export function assayExportRows(assays, assayElements) {
  // #2487 — an oxide basis exports under the oxide's header (Li2O_pct), which the import reads back as that oxide
  const els = (assayElements || []).map((e) => { const b = unitBasis(e.unit); return { symbol: e.symbol, header: b.oxide ? `${b.oxide}_${UNIT_TAG[b.base]}` : `${e.symbol}_${UNIT_TAG[String(e.unit || "ppm").toLowerCase()] || String(e.unit || "ppm").replace(/[^\w]+/g, "")}` }; });
  const num = (v) => +Number(v).toPrecision(12);
  return (assays || []).map((a) => {
    const row = { hole_id: a.hole_id, from: a.from, to: a.to, sample_id: a.sample_id ?? "", sample_type: a.sample_type ?? "", parent_id: a.parent_id ?? "", qc_code: a.qc_code ?? "", source: a.source ?? "" };
    for (const e of els) {
      const v = a.values?.[e.symbol], q = a.qualifiers?.[e.symbol];
      row[e.header] = v == null || !Number.isFinite(Number(v)) ? "" : q === "<" ? `<${num(v * 2)}` : q === ">" ? `>${num(v)}` : num(v);
    }
    return row;
  });
}


// TASKS.csv #1524 — open a grade histogram on the log scale when a linear one would be one bar: positive values spanning
// more than two decades (the plot colour ramp's own log switch, #1091), or a CV above 150 %. Lawyers' Au: CV 962 %, 0.0025-136 ppm.
// stats: { sorted (ascending), cv (%) } as Grade stats computes them
export function histogramWantsLog(stats) {
  if (!stats?.sorted?.length) return false;
  const pos = stats.sorted.find((v) => v > 0), max = stats.sorted[stats.sorted.length - 1];
  if (!(pos > 0) || !(max > pos)) return false;
  return max / pos > 100 || (Number.isFinite(stats.cv) && stats.cv > 150);
}

// TASKS.csv #1392 (review #1352, Silvertip) — the Alteration Box Plot and the volcanic classifiers assume a volcanic protolith; on a
// carbonate-hosted deposit (Silvertip's limestone and dolostone: CaO in the AI denominator) most samples pile at CCPI ~100 with no word.
// The share of the samples with a Ca value that hold Ca >= 10 % (about 14 % CaO; a basalt is ~7 % Ca); null without Ca. Geochem
// shows the caveat above a third (Silvertip: 47 % of the assays).
export const VOLCANIC_DIAGRAMS = ["boxplot", "tas", "winchester", "afm", "jensen", "thnbyb", "tizry", "thhfta"];
export function carbonateShare(samples, elementUnits) {
  let n = 0, hi = 0;
  for (const s of samples || []) { const v = s?.values?.Ca == null ? null : valueIn(s, "Ca", "%", elementUnits || {}); if (v == null || !Number.isFinite(v)) continue; n++; if (v >= 10) hi++; }
  return n ? hi / n : null;
}

// TASKS.csv #2222 — the default-cap screen shared by the grade shell pane (the Estimation dialog's #1573 rule)
export const CAP_CV_PCT = 150; // the #1573 screen
// sample stdev / mean as a percentage, as GradeStatistics and the Estimation dialog compute it; null under 3 values or a mean of 0
export function elementCvPct(assays, symbol) {
  const vals = (assays || []).map((a) => a.values?.[symbol]).filter((v) => Number.isFinite(v));
  if (vals.length < 3) return null;
  const mean = vals.reduce((t, v) => t + v, 0) / vals.length;
  if (!(mean > 0)) return null;
  const variance = vals.reduce((t, v) => t + (v - mean) ** 2, 0) / (vals.length - 1);
  return (Math.sqrt(variance) / mean) * 100;
}
