// TASKS.csv #2627 (follow-up of #2487) — change the basis an element's grades are REPORTED AS in an existing project: as the element (Li, "%")
// or as one of its oxides (Li2O, "% Li2O"). The basis lives in the element's unit (geochem.js unitBasis: "% Li2O" = the stored numbers are
// Li2O wt%), so a change converts every stored number of that element (each row's values and its per-method values, #2629) by the ratio of
// the two oxide factors, and the unit with it; the base unit (% / ppm / ppb) is kept. Works for the drill assays and the surface samples
// (rows with `values` / `methodValues`). Pure: the store applies the result as one undoable step.
import { unitBasis, oxideBasisUnit, oxidesOfElement } from "./geochemColumns.js"; // TASKS.csv #3159: geochemColumns, not geochem.js (the whole geochem library in startup)

const BASES = new Set(["%", "ppm", "ppb"]);

// The bases an element can be reported in: [{ unit, oxide }] — the element itself first, then each oxide of that element. [] for an element
// whose unit is not % / ppm / ppb (g/t, a count...), a calculated element (its values come from an expression), or one with no oxide.
export function basisChoices(element) {
  if (!element?.symbol || element.calculated) return [];
  const u = String(element.unit ?? "").trim(), b = unitBasis(u);
  if (!(BASES.has(u) || b.oxide)) return [];
  const oxides = oxidesOfElement(element.symbol);
  if (!oxides.length) return [];
  return [{ unit: b.base, oxide: null }, ...oxides.map((o) => ({ unit: oxideBasisUnit(b.base, o.oxide), oxide: o.oxide }))];
}

// The multiplier from one basis to the other (same base unit): element = oxide / factor, oxide = element * factor. null when not convertible.
export function basisFactor(fromUnit, toUnit) {
  const a = unitBasis(fromUnit), b = unitBasis(toUnit);
  if (a.base !== b.base) return null;
  if (a.oxide && b.oxide && a.symbol !== b.symbol) return null;
  return b.factor / a.factor;
}

const scaled = (v, m) => (typeof v === "number" && Number.isFinite(v) ? Number((v * m).toPrecision(12)) : v);

// rows with the element's numbers converted (rows without it keep their identity) -> { rows, changed }
export function rebaseRows(rows, symbol, m) {
  let changed = 0;
  const out = (rows || []).map((r) => {
    const hasV = r?.values && Object.prototype.hasOwnProperty.call(r.values, symbol);
    const mv = r?.methodValues?.[symbol];
    if (!hasV && !mv) return r;
    changed++;
    const next = { ...r };
    if (hasV) next.values = { ...r.values, [symbol]: scaled(r.values[symbol], m) };
    if (mv) next.methodValues = { ...r.methodValues, [symbol]: Object.fromEntries(Object.entries(mv).map(([k, v]) => [k, scaled(v, m)])) };
    return next;
  });
  return { rows: changed ? out : rows, changed };
}

// The change itself: elements (assayElements or surfaceElements), rows (assays or surfaceSamples), the symbol and the unit wanted.
// -> { elements, rows, changed, factor, from, to } or { error } (an unknown element, a basis it can't take, the basis it already has)
export function changeElementBasis(elements, rows, symbol, toUnit) {
  const el = (elements || []).find((e) => e.symbol === symbol);
  if (!el) return { error: "unknown" };
  const choices = basisChoices(el);
  if (!choices.some((c) => c.unit === toUnit)) return { error: "not a basis of this element" };
  if (el.unit === toUnit) return { error: "same" };
  const m = basisFactor(el.unit, toUnit);
  if (m == null) return { error: "not convertible" };
  const r = rebaseRows(rows, symbol, m);
  return { elements: elements.map((e) => (e === el ? { ...e, unit: toUnit } : e)), rows: r.rows, changed: r.changed, factor: m, from: el.unit, to: toUnit };
}

// The geochemical threshold rules decided for the element (#841, ThresholdToolkit: { symbol, unit, values: { population: number }, source }),
// in the same basis as the data: those of this element in `from` are converted to `to`; `drill` picks the drill rules (source "drill") or the
// surface ones. -> { list, changed } (the same list when none changed)
export function rebaseThresholds(list, symbol, from, to, m, drill) {
  let changed = 0;
  const out = (list || []).map((r) => {
    if (r?.symbol !== symbol || r.unit !== from || (r.source === "drill") !== !!drill) return r;
    changed++;
    return { ...r, unit: to, values: Object.fromEntries(Object.entries(r.values || {}).map(([k, v]) => [k, scaled(v, m)])) };
  });
  return { list: changed ? out : list, changed };
}
