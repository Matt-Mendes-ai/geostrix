// TASKS.csv #3598 (Fireweed rehearsal, Macpass) — the tonnes-and-grade cautions said much (not a resource, conceptual, ranges, extrapolated volume)
// but not what a core shack asks first of this data: the estimate pools all the drilling from 1952 to 2023, core with RC, with no geology model or
// domain. What a model pools, from its holes (params.holeIds, #3595) and the collars: the years drilled (by decade) when the collars carry a year,
// the hole types when they carry one, and whether a domain or a closed solid bounds it. Pure; English (the CSV header); the table words it.
const YEAR_KEY = /^(year|yr|drill_?year|year_?drilled|drilled|date_?drilled|drill_?date|start_?date|date)$/i;
const TYPE_KEY = /^(hole[ _]?type|holetype|drill_?type|dh_?type|drill_?method|drilling_?method|rig_?type|type)$/i;
const yearOf = (v) => { const m = /(19|20)\d\d/.exec(String(v ?? "")); return m ? Number(m[0]) : null; };
const fieldOf = (attrs, re) => { for (const k of Object.keys(attrs || {})) if (re.test(k.trim())) return k; return null; };

// -> { holes, years: { min, max, decades: [[decade, n]] } | null, types: [[type, n]] | null, domain: string | null, volume: string | null } | null
export function poolBasis(holeIds, collars, params = {}) {
  const ids = holeIds instanceof Set ? holeIds : new Set(holeIds || []);
  if (!ids.size) return null;
  const mine = (collars || []).filter((c) => ids.has(c.hole_id));
  const yearKey = mine.length ? fieldOf(mine.find((c) => fieldOf(c.attrs, YEAR_KEY))?.attrs, YEAR_KEY) : null;
  // the normalized 'hole type' (#2161 / #3551) first, else the file's own column
  const typeKey = mine.some((c) => c.attrs?.["hole type"]) ? "hole type" : mine.length ? fieldOf(mine.find((c) => fieldOf(c.attrs, TYPE_KEY))?.attrs, TYPE_KEY) : null;
  let years = null, types = null;
  if (yearKey) {
    const dec = new Map(); let min = Infinity, max = -Infinity;
    for (const c of mine) { const y = yearOf(c.attrs?.[yearKey]); if (y == null) continue; min = Math.min(min, y); max = Math.max(max, y); const d = Math.floor(y / 10) * 10; dec.set(d, (dec.get(d) || 0) + 1); }
    if (Number.isFinite(min)) years = { min, max, decades: [...dec].sort((a, b) => a[0] - b[0]) };
  }
  if (typeKey) {
    const t = new Map();
    for (const c of mine) { const v = String(c.attrs?.[typeKey] ?? "").trim(); if (v) t.set(v, (t.get(v) || 0) + 1); }
    if (t.size) types = [...t].sort((a, b) => b[1] - a[1]);
  }
  return { holes: ids.size, years, types, domain: params?.domain || null, volume: params?.restrictedToVolumeName || null };
}

export const decadesText = (years) => years.decades.map(([d, n]) => `${d}s ${n}`).join(", ");
export const typesText = (types) => types.map(([t, n]) => `${t} ${n}`).join(", ");
// the CSV header's line (English, as the rest of the file)
export function poolBasisLine(b) {
  if (!b) return null;
  return `Pooled: ${b.holes} holes${b.years ? ` drilled ${b.years.min}-${b.years.max} (${decadesText(b.years)})` : ""}${b.types ? `; hole types: ${typesText(b.types)}` : ""}; ${b.domain ? `domain: ${b.domain}` : b.volume ? `inside: ${b.volume}` : "one domain: no geology model or domain bounds the estimate"}`;
}
