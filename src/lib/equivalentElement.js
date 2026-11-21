// TASKS.csv #3923 (user feedback: gold equivalent, silver equivalent ...; "the calculations vary from project to project") — a calculated metal equivalent (AuEq, AgEq,
// CuEq ...) built from prices and recoveries the user TYPES for every metal: no price, recovery or factor is ever filled in. The same arithmetic Best intercepts uses
// for its on-the-fly equivalent (geochem.js metalEquivalent: value per tonne = grade x price per gram x recovery, over the base metal's), written once as a linear
// formula (each metal's coefficient takes in its unit conversion) so the Calculated element panel can store it like any calculated column, show it, and let the user read
// and check every number. The inputs are kept with the element (calculated.equivalent) so the audit trail says where each coefficient came from. Pure.
import { metalEquivalent, metalEquivalentFormula, PRECIOUS_METALS } from "./geochem.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));

// eq: { base: "Au", rows: { Ag: { on, price, recovery (%) }, Au: { price, recovery } } } (the base's own row holds its price and recovery); elements: the assay elements
// -> { ready, problem, name, unit, expr, metals, meta, text }
export function equivalentFromInputs(eq, elements) {
  const base = eq?.base;
  const real = (elements || []).filter((e) => !e.calculated);
  const unitOf = (s) => real.find((e) => e.symbol === s)?.unit || "ppm";
  if (!base || !real.some((e) => e.symbol === base)) return { ready: false, problem: "base" };
  const others = real.map((e) => e.symbol).filter((s) => s !== base && eq.rows?.[s]?.on);
  if (!others.length) return { ready: false, problem: "others" };
  const metals = [base, ...others].map((s) => ({ symbol: s, unit: unitOf(s), price: num(eq.rows?.[s]?.price), recovery: num(eq.rows?.[s]?.recovery) / 100 }));
  if (!metals.every((m) => m.price > 0 && m.recovery > 0 && m.recovery <= 1)) return { ready: false, problem: "inputs" };
  // each metal's coefficient: its value in the base metal's own unit per unit of its own grade, as metalEquivalent reads a grade of 1 of it and 0 of the rest
  const terms = metals.map((m, i) => {
    if (i === 0) return m.symbol;
    const grades = Object.fromEntries(metals.map((x) => [x.symbol, x.symbol === m.symbol ? 1 : 0]));
    const c = metalEquivalent(grades, metals);
    return `${m.symbol}*${+c.toPrecision(8)}`;
  });
  const meta = { base, metals: metals.map((m) => ({ symbol: m.symbol, price: m.price, priceUnit: PRECIOUS_METALS.has(m.symbol) ? "$/oz" : "$/lb", recovery: +(m.recovery * 100).toFixed(4) })), text: metalEquivalentFormula(metals) };
  return { ready: true, name: `${base}Eq`, unit: unitOf(base), expr: terms.join("+"), metals, meta, text: meta.text };
}

// the base metal to start with: gold when the project has it, else silver, else the first element
export function suggestedBase(elements) {
  const syms = (elements || []).filter((e) => !e.calculated).map((e) => e.symbol);
  return ["Au", "Cu", "Ag", "Zn"].find((s) => syms.includes(s)) || syms[0] || "";
}
