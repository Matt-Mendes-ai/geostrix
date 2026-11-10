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
import { convertUnit } from "./geochem.js"; // TASKS.csv #2500

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
];

// #2500 — the units a preset reads, against the stored ones: [{ sym, from, to, factor }] for the ones that differ; throws when a stored unit
// cannot be converted (an index, counts, a missing unit)
const CONVERTIBLE = new Set(["%", "ppm", "ppb", "g/t"]);
export function presetConversions(assayElements, readUnits) {
  const out = [];
  for (const [sym, to] of Object.entries(readUnits || {})) {
    const from = (assayElements || []).find((e) => e.symbol === sym)?.unit || "";
    if (from === to || (from === "g/t" && to === "ppm") || (from === "ppm" && to === "g/t")) continue;
    if (!CONVERTIBLE.has(from)) throw new Error(tr("{sym} is stored in \"{u}\", which this preset cannot convert to {to}.", { sym, u: from || "?", to }));
    out.push({ sym, from, to, factor: convertUnit(1, from, to) });
  }
  return out;
}
// Returns { assays, element, computed, skipped, min, max } or throws with a readable message.
// #2500 — readUnits ({ K: "%", Rb: "ppm" }, a preset's): the elements are converted to those units before the formula reads them.
export function addCalculatedElement(assays, assayElements, name, expr, unit = "index", { readUnits = null } = {}) {
  const n = String(name || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error(tr("Name must start with a letter and use only letters, digits and _."));
  if ((assayElements || []).some((e) => e.symbol === n)) throw new Error(tr("\"{n}\" already exists — pick another name.", { n }));
  const symbols = (assayElements || []).map((e) => e.symbol);
  const fn0 = compileCalc(expr, symbols); // throws on bad syntax / unknown names
  const conv = presetConversions(assayElements, readUnits); // #2500
  const fn = conv.length ? (vals) => { const w = { ...vals }; for (const c of conv) if (w[c.sym] != null) w[c.sym] = w[c.sym] * c.factor; return fn0(w); } : fn0;
  let computed = 0, skipped = 0, min = Infinity, max = -Infinity;
  const out = (assays || []).map((a) => {
    const v = fn(a.values || {});
    if (!Number.isFinite(v)) { skipped++; return a; }
    computed++; if (v < min) min = v; if (v > max) max = v;
    return { ...a, values: { ...(a.values || {}), [n]: v } };
  });
  if (!computed) throw new Error(tr("The formula gave no value on any assay row — check that every element in it has results."));
  return { assays: out, element: { symbol: n, unit, calculated: { expr: String(expr).trim(), ...(readUnits ? { readUnits } : {}) } }, computed, skipped, min, max, converted: conv };
}
