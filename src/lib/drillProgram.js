// TASKS.csv #2581 (review #2486, WA lithium) — a planned hole had no hole type and the program one cost per metre: aircore, RC and diamond
// on one project could not be told apart in the plan, the cost or the rig file. A planned hole takes an optional type; the checks take a
// rate per type (kept with the project) and give the metres and the cost by type. No rate is ever assumed. Pure.

// the types the project's own collars use, offered as suggestions: values of a collar field named like a drill type
const TYPE_FIELD = /^(drill|hole)[\s_-]*(type|code|method)$|^(type|method)$/i;
export function collarHoleTypes(collars, max = 12) {
  const seen = new Map();
  for (const c of collars || []) for (const [k, v] of Object.entries(c?.attrs || {})) {
    if (!TYPE_FIELD.test(String(k).trim())) continue;
    const s = String(v ?? "").trim();
    if (s) seen.set(s, (seen.get(s) || 0) + 1);
  }
  return [...seen].sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v);
}

// holes [{ type, length }], rates { type: $/m } -> { rows: [{ type, n, m, rate, cost }], totalM, totalCost (null unless every type with
// metres has a rate), missing: [types without a rate] }. The untyped holes are type "".
// TASKS.csv #3347 (review #3195) — the program's cost was metres times a rate and nothing else. Optional fixed amounts: per hole, and per NEW
// pad (a planned collar more than padM from every drilled collar and from the planned collars before it). -> { holes, newPads, fixed (null
// when neither amount is typed) }
export const FIXED_KEYS = { perHole: "__perHole", perPad: "__perPad" }; // kept in the drill rates beside the per-type $/m
export function fixedCosts(planned, drilledCollars, rates = {}, padM = 10) {
  const perHole = Number(rates?.[FIXED_KEYS.perHole]) > 0 ? Number(rates[FIXED_KEYS.perHole]) : null;
  const perPad = Number(rates?.[FIXED_KEYS.perPad]) > 0 ? Number(rates[FIXED_KEYS.perPad]) : null;
  const near = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)) <= padM;
  const pads = [];
  let newPads = 0;
  for (const h of planned || []) {
    if (!Number.isFinite(Number(h?.x)) || !Number.isFinite(Number(h?.y))) continue;
    if ((drilledCollars || []).some((c) => Number.isFinite(c?.x) && near(h, c)) || pads.some((p) => near(h, p))) continue;
    pads.push(h); newPads++;
  }
  const holes = (planned || []).length;
  return { holes, newPads, perHole, perPad, fixed: perHole == null && perPad == null ? null : (perHole || 0) * holes + (perPad || 0) * newPads };
}
export function costByType(holes, rates = {}) {
  const by = new Map();
  for (const h of holes || []) {
    const t = String(h?.type ?? "").trim(), m = Number(h?.length) || 0;
    const r = by.get(t) || { type: t, n: 0, m: 0 };
    r.n++; r.m += m; by.set(t, r);
  }
  const rows = [...by.values()].sort((a, b) => (a.type === "" ? 1 : b.type === "" ? -1 : a.type.localeCompare(b.type)));
  let totalM = 0, totalCost = 0;
  const missing = [];
  for (const r of rows) {
    const rate = Number(rates?.[r.type]);
    r.rate = Number.isFinite(rate) && rate > 0 ? rate : null;
    r.cost = r.rate != null ? r.m * r.rate : null;
    totalM += r.m;
    if (r.cost != null) totalCost += r.cost; else if (r.m > 0) missing.push(r.type);
  }
  return { rows, totalM, totalCost: missing.length ? null : totalCost, missing };
}
