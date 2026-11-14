// TASKS.csv #3159 — the parts of geochem.js the startup code needs, moved verbatim: element / oxide column names and units (the
// layers, the legends, the import helpers and the store's oxide basis), PRECIOUS_METALS / gradeUnitLabel, parseAssayValue and the
// surface-sample attribute columns. Importing these from geochem.js put all of it (intercepts, compositing, statistics) in the
// startup bundle. geochem.js re-exports everything here, so its other importers and the tests are unchanged.
import { dateColumnReader, withDateFields } from "./dateColumns.js"; // TASKS.csv #3200

export const ELEMENT_SYMBOLS = ["Ag","Al","As","Au","B","Ba","Be","Bi","Br","Ca","Cd","Ce","Cl","Co","Cr","Cs","Cu",
  "Dy","Er","Eu","F","Fe","Ga","Gd","Ge","Hf","Hg","Ho","In","Ir","K","La","Li","Lu","Mg","Mn","Mo","Na","Nb",
  "Nd","Ni","Os","P","Pb","Pd","Pr","Pt","Rb","Re","Rh","Ru","S","Sb","Sc","Se","Si","Sm","Sn","Sr","Ta","Tb",
  "Te","Th","Ti","Tl","Tm","U","V","W","Y","Yb","Zn","Zr"];
// Elements a bare header (no unit in it) is read in %: the ones a multi-acid ICP package reports in percent (ALS ME-ICP61:
// Al Ca Fe K Mg Na S Ti; Si comes from whole-rock). TASKS.csv #718 — Cr, Mn and P were listed too, but those packages
// report them in ppm, and Cr at 5-100 ppm (normal in felsic / intermediate volcanics) was read as 5-100 % (the #210
// rule only switches to ppm above 100). Whole-rock Cr2O3 / MnO / P2O5 arrive as oxide headers (#403) and stay %.
export const MAJOR_PCT = new Set(["Al","Ca","Fe","K","Mg","Na","S","Ti","Si"]);
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
  return ELEMENT_SYMBOLS.find((s) => s.toLowerCase() === first.toLowerCase()) || numberedElement(first) || gluedUnitElement(first) || unitOnlyElement(header) || false;
}
// TASKS.csv #3129 (Central Lapland: GTK's whole-rock C_pct was dropped) — carbon and nitrogen are elements only with their unit right after the
// symbol: C_pct, C-ppm, "C (%)", N_ppm, CPCT. A bare C or N column (a code, a class) stays an ordinary column, and so does a qualified
// carbon (C_org_pct, C_graphitic_pct: another analyte than total carbon) or one whose unit comes later (C_LECO_pct: map it by hand)
export const UNIT_ONLY_SYMBOLS = ["C", "N"];
const UNIT_RIGHT_AFTER = /^\s*([CN])\s*(?:[\s_-]+(ppm|ppb|pct|pc|wt%|wt_?pct|%|gpt|g\/t)|\(\s*(ppm|ppb|pct|%|wt\s*%|g\/t)\s*\))\s*$/i;
function unitOnlyElement(header) {
  const m = UNIT_RIGHT_AFTER.exec(String(header));
  return m ? m[1].toUpperCase() : false;
}
// TASKS.csv #2157 (WA drillhole review) — the unit glued to the symbol: AUPPB, AUPPM, PTPPB, CUPCT, NIPC (336 / 226 / 147 WAMEX files)
const GLUED_UNIT = /^([A-Za-z]{1,2})(ppb|ppm|pct|pc|gpt)$/i;
function gluedUnitElement(token) {
  const m = GLUED_UNIT.exec(token);
  if (!m) return false;
  const sym = m[1].length === 1 ? m[1].toUpperCase() : m[1][0].toUpperCase() + m[1][1].toLowerCase();
  return ELEMENT_SYMBOLS.includes(sym) || UNIT_ONLY_SYMBOLS.includes(sym) ? sym : false; // #3129 — CPCT, NPPM: the unit is there
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
// TASKS.csv #2627 — the oxides an element can be reported as (Li -> Li2O; Fe -> Fe2O3, FeO): [{ oxide, factor }]
export const oxidesOfElement = (symbol) => Object.entries(OXIDE_HEADERS).filter(([, [s]]) => s === symbol).map(([oxide, [, factor]]) => ({ oxide, factor }));

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

// TASKS.csv #841 — the descriptive columns of a surface-sample file (horizon, landform, lab, year, sample type...) are
// kept on each sample as `attrs`, so thresholds and backgrounds can be judged per population. Kept: every column that
// is not mapped (x / y / z / id / medium) and not an element column, whose non-empty values have at most
// SURFACE_ATTR_MAX_DISTINCT distinct entries (categories, not running numbers, comments or coordinates); text is cut
// to 60 characters.
export const SURFACE_ATTR_MAX_DISTINCT = 100;
export const SURFACE_ATTR_MAX_CHARS = 500; // TASKS.csv #1822
// TASKS.csv #1822 — a free-text column (a description, a comment) has as many distinct values as rows; it is kept whole for Identify
export const isFreeTextHeader = (h) => /desc|comment|note|remark|observ/i.test(String(h || ""));
// TASKS.csv #1802 (review #1646, Kodiak) — a station / site id ('Site ID' NWZ069) is how a crew finds a site again: kept like free text however
// many values it has (it never becomes a population to group by: groupOptions takes 2-30 values)
export const isIdHeader = (h) => /(^|[\s_-])(site|station|stn|field)[\s_-]*(id|no|num|number|name|code)?($|[\s_-])|^(site|station|stn)$|(^|[\s_-])(waypoint|wpt|gps[\s_-]*(id|name))($|[\s_-])/i.test(String(h || "").trim());
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
      // free text: #1822; a site / station id: #1802; TASKS.csv #3200 — a column of dates is kept however many days it holds (a sample date was left out
      // past 100 values, so never read as a date)
      if (seen.size > SURFACE_ATTR_MAX_DISTINCT && !isFreeTextHeader(h) && !isIdHeader(h)) return !!dateColumnReader(rows.map((x) => attrText(x[h])));
    }
    return seen.size > 0;
  });
}
// TASKS.csv #2728 (split from #1802) — the columns the import leaves out of the sample attributes because they hold too many different
// values to be one (more than SURFACE_ATTR_MAX_DISTINCT, and neither a note nor an id): the dialog names them, so a wanted field is not
// lost unseen. Mapped, element and empty columns are not listed. -> [header]
export function surfaceAttrLeftOut(headers, rows, mapping = {}, elements = [], exclude = []) {
  const kept = new Set(surfaceAttrColumns(headers, rows, mapping, elements));
  const mapped = new Set(Object.values(mapping || {}).filter(Boolean));
  const elementCols = new Set();
  (elements || []).forEach((e) => { [e.header, e.mainHeader, e.overLimit?.header].forEach((h) => h && elementCols.add(h)); });
  const skip = new Set(exclude || []);
  return (headers || []).filter((h) => h && !kept.has(h) && !mapped.has(h) && !elementCols.has(h) && !skip.has(h) && (rows || []).some((r) => r[h] != null && String(r[h]).trim() !== ""));
}
// TASKS.csv #1509 — Papa's dynamic typing reads an ISO timestamp cell ('2021-06-05T00:00:00.000Z') as a Date, and String(Date) is the
// computer's LOCAL time: 'Fri Jun 04 2021 16:00:00 GMT-0800' in BC, the day before. A date at UTC midnight is kept as 'yyyy-mm-dd',
// any other moment as the ISO text; whatever the computer's time zone.
export function attrText(v) {
  if (v instanceof Date) { if (Number.isNaN(v.getTime())) return ""; const iso = v.toISOString(); return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso; }
  return v == null ? "" : String(v).trim();
}
// TASKS.csv #3200 (from #3075) — the kept columns that read as dates, as the collar import reads them: each stored as an ISO date with a
// '<col> year' field beside it (lib/dateColumns.js). -> { readers: Map(attr key -> reader), ambiguous: [header] (day / month cannot be told apart)}
export function surfaceDateReaders(rows, cols) {
  const readers = new Map(), ambiguous = [];
  for (const h of cols || []) {
    const rd = dateColumnReader((rows || []).map((r) => attrText(r[h])));
    if (rd?.ambiguous) ambiguous.push(h); else if (rd) readers.set(String(h).replace(/\s+/g, " ").trim(), rd);
  }
  return { readers, ambiguous };
}
// surfaceAttrs with the date columns read (#3200)
export function surfaceAttrsDated(row, cols, readers) {
  const a = surfaceAttrs(row, cols);
  return a.attrs && readers?.size ? { attrs: withDateFields(a.attrs, readers) } : a;
}
export function surfaceAttrs(row, cols) {
  const attrs = {};
  // #1822: a field note is read whole in Identify (was 60 characters); TASKS.csv #1828 — the key on one line (an Excel header 'Digest_Run NA \r\nPb-OG62')
  cols.forEach((h) => { const t = attrText(row[h]); if (t !== "") attrs[String(h).replace(/\s+/g, " ").trim()] = t.slice(0, SURFACE_ATTR_MAX_CHARS); });
  return Object.keys(attrs).length ? { attrs } : {};
}
