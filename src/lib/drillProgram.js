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
