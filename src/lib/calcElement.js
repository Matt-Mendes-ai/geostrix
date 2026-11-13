// TASKS.csv #401 — calculated assay columns. Vectoring indices (Ishikawa AI, CCPI, Zn/(Zn+Pb), Cu/(Cu+Zn))
// are the main VMS exploration tools, but they only existed as scatter plots; they could not be shown
// downhole, in 3D, on sections, or composited. A calculated element is stored like any other element
// (a value on each assay row + an assayElements entry), so everything that takes an element — 3D assay
// display, strip logs, intercepts, compositing, estimation, sections — takes it too.
//
// Formulas use the safe expression compiler (#344, no eval). Element symbols are the variables, read in
// the unit each element is stored in (see the element list). Rows missing any element in the formula get
// no value (NaN is never stored), so an index is never computed from a partial analysis.
import { compileCalc } from "./calcExpr.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
import { convertUnit, unitBasis, oxideAliases } from "./geochem.js"; // TASKS.csv #2500; unitBasis: #2487; oxideAliases: #2914
import { isBelowDetection } from "./assayFlags.js"; // TASKS.csv #2505

// TASKS.csv #2500 (review #2486, WA lithium) — each preset says the unit it reads every element in (`units`), and the calculation
// converts from the stored unit where they differ: K/Rb read 'K in %, Rb in ppm' off the stored numbers, and on an XRF suite with Rb
// stored in % it gave 9,078-13,410,808 where K/Rb runs 0.9-1,341. A formula written by hand still reads the stored units.
// Element wt% -> oxide wt% factors are written into the presets so AI/CCPI use oxides as defined. VMS indices first, then porphyry (#1678).
export const CALC_PRESETS = [
  { name: "AI", label: "Ishikawa alteration index (AI)", expr: "100*(K*1.2046+Mg*1.6583)/(K*1.2046+Mg*1.6583+Na*1.3480+Ca*1.3992)", needs: ["K", "Mg", "Na", "Ca"], unitNote: "K, Mg, Na, Ca must be in %", units: { K: "%", Mg: "%", Na: "%", Ca: "%" } },
  { name: "CCPI", label: "Chlorite-carbonate-pyrite index (CCPI)", expr: "100*(Mg*1.6583+Fe*1.2865)/(Mg*1.6583+Fe*1.2865+Na*1.3480+K*1.2046)", needs: ["Mg", "Fe", "Na", "K"], unitNote: "Mg, Fe, Na, K must be in %; Fe as FeO total", units: { Mg: "%", Fe: "%", Na: "%", K: "%" } },
  { name: "ZnRatio", label: "Zn ratio 100·Zn/(Zn+Pb)", expr: "100*Zn/(Zn+Pb)", needs: ["Zn", "Pb"], unitNote: "Zn and Pb in the same unit", units: { Zn: "ppm", Pb: "ppm" } },
  { name: "CuRatio", label: "Cu ratio 100·Cu/(Cu+Zn)", expr: "100*Cu/(Cu+Zn)", needs: ["Cu", "Zn"], unitNote: "Cu and Zn in the same unit", units: { Cu: "ppm", Zn: "ppm" } },
  // TASKS.csv #1678 (review #1645, Copley) — porphyry alteration and metal ratios (molar masses K 39.098, Na 22.990, Ca 40.078, Al 26.982)
  { name: "KAl", label: "Molar K/Al (potassic / phyllic alteration)", expr: "(K/39.098)/(Al/26.982)", needs: ["K", "Al"], unitNote: "K and Al in the same unit (both % or both ppm)", units: { K: "%", Al: "%" } },
  { name: "NaAl", label: "Molar Na/Al (albite / sodic alteration)", expr: "(Na/22.990)/(Al/26.982)", needs: ["Na", "Al"], unitNote: "Na and Al in the same unit (both % or both ppm)", units: { Na: "%", Al: "%" } },
  { name: "CNKAl", label: "Molar (2Ca+Na+K)/Al", expr: "(2*Ca/40.078+Na/22.990+K/39.098)/(Al/26.982)", needs: ["Ca", "Na", "K", "Al"], unitNote: "Ca, Na, K and Al in the same unit", units: { Ca: "%", Na: "%", K: "%", Al: "%" } },
  { name: "CuAu", label: "Cu/Au ratio", expr: "Cu/Au", needs: ["Cu", "Au"], unitNote: "read in the stored units (Cu ppm / Au ppm gives the usual ratio); say the units with the result", units: { Cu: "ppm", Au: "ppm" } },
  // TASKS.csv #1526 (review #1497, Lawyers) — the presets were VMS and porphyry only. Not added: an As+Sb+Hg
  // sum (in ppm As outweighs the others a hundredfold, so it is As) and Au + Ag/80 (a metal equivalent needs prices: Best intercepts asks)
  { name: "AgAu", label: "Ag/Au ratio", expr: "Ag/Au", needs: ["Ag", "Au"], unitNote: "Ag and Au in the same unit (both ppm or g/t); where Au sits at its detection limit the ratio runs to thousands and means little", units: { Ag: "ppm", Au: "ppm" } },
  { name: "ZnPb", label: "Zn + Pb (combined grade)", expr: "Zn+Pb", needs: ["Zn", "Pb"], unitNote: "Zn and Pb in the same unit (both %): the combined grade lead-zinc intercepts are often quoted in", units: { Zn: "%", Pb: "%" } },
  // Matt, 2026-11-06: "GeoStrix is made for any kind of deposit" — common ratios for other styles too, each named for what it measures
  { name: "SrY", label: "Sr/Y (magma fertility)", expr: "Sr/Y", needs: ["Sr", "Y"], unitNote: "Sr and Y in the same unit (both ppm)", units: { Sr: "ppm", Y: "ppm" } },
  { name: "KRb", label: "K/Rb (pegmatite and granite fractionation)", expr: "K*10000/Rb", needs: ["K", "Rb"], unitNote: "K in %, Rb in ppm", units: { K: "%", Rb: "ppm" } },
  { name: "NiCu", label: "Ni/Cu ratio", expr: "Ni/Cu", needs: ["Ni", "Cu"], unitNote: "Ni and Cu in the same unit", units: { Ni: "ppm", Cu: "ppm" } },
  { name: "ThU", label: "Th/U ratio", expr: "Th/U", needs: ["Th", "U"], unitNote: "Th and U in the same unit (both ppm)", units: { Th: "ppm", U: "ppm" } },
  // TASKS.csv #2357 (review #2325, WA uranium) — element to oxide, the unit uranium, lithium and rare-metal results are quoted in (U3O8 was
  // typed by hand). Factors: oxide molar mass / (n x element molar mass); unit: the result's (read the element in it, #2500).
  { name: "U3O8", label: "U3O8 from U (x 1.1792)", expr: "U*1.1792", needs: ["U"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { U: "ppm" }, unit: "ppm" },
  { name: "Li2O", label: "Li2O from Li (x 2.1527)", expr: "Li*2.1527", needs: ["Li"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Li: "%" }, unit: "%" },
  { name: "Ta2O5", label: "Ta2O5 from Ta (x 1.2211)", expr: "Ta*1.2211", needs: ["Ta"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Ta: "ppm" }, unit: "ppm" },
  { name: "Nb2O5", label: "Nb2O5 from Nb (x 1.4305)", expr: "Nb*1.4305", needs: ["Nb"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Nb: "ppm" }, unit: "ppm" },
  { name: "V2O5", label: "V2O5 from V (x 1.7852)", expr: "V*1.7852", needs: ["V"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { V: "ppm" }, unit: "ppm" },
  { name: "WO3", label: "WO3 from W (x 1.2611)", expr: "W*1.2611", needs: ["W"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { W: "ppm" }, unit: "ppm" },
  { name: "SnO2", label: "SnO2 from Sn (x 1.2696)", expr: "Sn*1.2696", needs: ["Sn"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Sn: "ppm" }, unit: "ppm" },
  { name: "Cs2O", label: "Cs2O from Cs (x 1.0602)", expr: "Cs*1.0602", needs: ["Cs"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Cs: "ppm" }, unit: "ppm" },
  { name: "Rb2O", label: "Rb2O from Rb (x 1.0936)", expr: "Rb*1.0936", needs: ["Rb"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Rb: "ppm" }, unit: "ppm" },
  // TASKS.csv #2914 (review #2876, WA iron) — the oxides an iron-ore closure is written in (the import's own factors), and iron on a
  // volatile-free basis. 'Oxide total' is built from the project's majors (oxideTotalPreset), not listed here.
  { name: "Fe2O3", label: "Fe2O3 from Fe (x 1.4297)", expr: "Fe*1.4297", needs: ["Fe"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Fe: "%" }, unit: "%" },
  { name: "MnO", label: "MnO from Mn (x 1.2912)", expr: "Mn*1.2912", needs: ["Mn"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { Mn: "%" }, unit: "%" },
  { name: "P2O5", label: "P2O5 from P (x 2.2914)", expr: "P*2.2914", needs: ["P"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { P: "%" }, unit: "%" },
  { name: "SO3", label: "SO3 from S (x 2.4971)", expr: "S*2.4971", needs: ["S"], unitNote: "Stoichiometric factor from the molar masses; the result is the oxide in the unit shown", units: { S: "%" }, unit: "%" },
  { name: "CalcFe", label: "Calcined Fe: Fe x 100 / (100 - LOI)", expr: "Fe*100/(100-LOI)", needs: ["Fe", "LOI"], unitNote: "Fe and LOI in %: the iron grade once the volatiles are driven off", units: { Fe: "%", LOI: "%" }, unit: "%" },
];

// TASKS.csv #2914 — 'Oxide total': the sum of the major oxides the project holds (QAQC > Totals' list and factors, through the oxide aliases),
// plus LOI when there is one. null with fewer than MIN_MAJORS majors or a major not stored in %.
export function oxideTotalPreset(assayElements, { majors, minMajors = 6 } = {}) {
  const aliases = new Map(oxideAliases(assayElements).map((a) => [a.name, a]));
  const names = [];
  for (const m of majors || []) {
    const e = (assayElements || []).find((x) => x.symbol === m.symbol);
    if (unitBasis(e?.unit).base !== "%") return null; // a sum of mixed units is not a total
    const al = aliases.get(m.oxide);
    if (!al) return null;
    names.push(m.oxide);
  }
  if (names.length < minMajors) return null;
  const loi = (assayElements || []).find((e) => e.symbol === "LOI" && String(e.unit || "") === "%");
  const terms = [...names, ...(loi ? ["LOI"] : [])];
  return { name: "OxTotal", label: loi ? "Oxide total with LOI" : "Oxide total (no LOI loaded)", expr: terms.join("+"), needs: [...(majors || []).map((m) => m.symbol), ...(loi ? ["LOI"] : [])], unitNote: "The major oxides QAQC > Totals sums, in %, read through the oxide names", unit: "%" };
}

// #2500 — the units a preset reads, against the stored ones: [{ sym, from, to, factor }] for the ones that differ; throws when a stored unit
// cannot be converted (an index, counts, a missing unit)
const CONVERTIBLE = new Set(["%", "ppm", "ppb", "g/t"]);
export function presetConversions(assayElements, readUnits) {
  const out = [];
  for (const [sym, to] of Object.entries(readUnits || {})) {
    const from = (assayElements || []).find((e) => e.symbol === sym)?.unit || "";
    if (from === to || (from === "g/t" && to === "ppm") || (from === "ppm" && to === "g/t")) continue;
    if (!CONVERTIBLE.has(from) && !unitBasis(from).oxide) throw new Error(tr("{sym} is stored in \"{u}\", which this preset cannot convert to {to}.", { sym, u: from || "?", to })); // #2487: an oxide basis ("% Rb2O") converts through its element
    out.push({ sym, from, to, factor: convertUnit(1, from, to) });
  }
  return out;
}
// TASKS.csv #2619 (re-test of #2500) — a preset's units apply while its formula is the preset's own: compared without spaces, so a typed space
// keeps the conversion; any other edit (K*10000/Cs) makes it the user's formula, read in the stored units, and the dialog says so
const bare = (s) => String(s ?? "").replace(/\s+/g, "");
export function presetUnitsFor(preset, expr) {
  return preset?.units && bare(expr) === bare(preset.expr) ? preset.units : null;
}
// the element symbols a formula reads (whole identifiers only: "Cu" in "Cu/Au", not in "CuAu"); #2914 — an oxide alias reads its element
export function operandsOf(expr, symbols, aliases = []) {
  const ids = new Set(String(expr ?? "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || []);
  const via = new Set(aliases.filter((a) => ids.has(a.name)).map((a) => a.symbol));
  return (symbols || []).filter((s) => ids.has(s) || via.has(s));
}
// Returns { assays, element, computed, skipped, min, max, leftBdl, flaggedLt } or throws with a readable message.
// #2500 — readUnits ({ K: "%", Rb: "ppm" }, a preset's): the elements are converted to those units before the formula reads them.
export function addCalculatedElement(assays, assayElements, name, expr, unit = "index", { readUnits = null } = {}) {
  const n = String(name || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error(tr("Name must start with a letter and use only letters, digits and _."));
  if ((assayElements || []).some((e) => e.symbol === n)) throw new Error(tr("\"{n}\" already exists — pick another name.", { n }));
  const symbols = (assayElements || []).map((e) => e.symbol);
  // #2914 — oxide names as aliases (SiO2, Fe2O3 ...), read from the STORED value before any preset conversion; only the ones the formula uses
  const ids = new Set(String(expr ?? "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || []);
  const allAliases = oxideAliases(assayElements), used = allAliases.filter((a) => ids.has(a.name));
  const fn0 = compileCalc(expr, [...symbols, ...allAliases.map((a) => a.name)]); // throws on bad syntax / unknown names
  const conv = presetConversions(assayElements, readUnits); // #2500
  const fn = conv.length || used.length ? (vals) => { const w = { ...vals }; for (const a of used) w[a.name] = w[a.symbol] != null ? w[a.symbol] * a.factor : null; for (const c of conv) if (w[c.sym] != null) w[c.sym] = w[c.sym] * c.factor; return fn0(w); } : fn0;
  // TASKS.csv #2505 (review #2486) — a below-detection operand: Li2O = Li x 2.1527 on a '<' Li stored no flag, Nb/Ta was computed on
  // 21,881 rows where both were numbers in 9,172. A formula without division keeps '<' when every operand is '<'; a ratio with a '<'
  // operand gets no value (counted as leftBdl), as the diagrams leave such a ratio out (#2501)
  const ops = operandsOf(expr, symbols, used), isRatio = /\//.test(String(expr)); // used: #2914
  // TASKS.csv #3160 (#2925 (8), review #2876) — a division by zero (every operand present, no finite result) was counted with the rows
  // missing an element: it is counted apart (divZero)
  let computed = 0, skipped = 0, leftBdl = 0, flaggedLt = 0, divZero = 0, min = Infinity, max = -Infinity;
  const out = (assays || []).map((a) => {
    const lts = ops.filter((s) => isBelowDetection(a, s)).length;
    if (isRatio && lts) { leftBdl++; return a; }
    const v = fn(a.values || {});
    if (!Number.isFinite(v)) { if (isRatio && ops.length && ops.every((s) => Number.isFinite(Number(a.values?.[s])) && a.values?.[s] !== null && a.values?.[s] !== "")) divZero++; else skipped++; return a; }
    computed++; if (v < min) min = v; if (v > max) max = v;
    if (ops.length && lts === ops.length) { flaggedLt++; return { ...a, values: { ...(a.values || {}), [n]: v }, ...(Array.isArray(a.bdl) ? { bdl: [...a.bdl, n] } : { qualifiers: { ...(a.qualifiers || {}), [n]: "<" } }) }; } // a surface sample: its bdl list
    return { ...a, values: { ...(a.values || {}), [n]: v } };
  });
  if (!computed) throw new Error(tr("The formula gave no value on any assay row — check that every element in it has results."));
  return { assays: out, element: { symbol: n, unit, calculated: { expr: String(expr).trim(), ...(readUnits ? { readUnits } : {}) } }, computed, skipped, min, max, converted: conv, leftBdl, flaggedLt, divZero };
}
