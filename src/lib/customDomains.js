// TASKS.csv #1678 (review #1645, Copley) — custom-layer categories as domains: Copley's Oxidation (O / T / S, the first domain for porphyry
// statistics and capping), QuickLog alteration and the Veins / Mineralization codes are custom layers, and Grade stats and Compositing
// offered only the built-in interval layers. Each interval custom layer's categorical fields (text codes, 2-30 distinct values, filled
// on at least half the rows, repeating: fewer values than half the rows) become a domain choice: { key: "custom:<layer id>:<field>", label: "<layer> · <field>", rows: [{ hole_id,
// from, to, value }] } - the shape the domain lookup and compositeAssays already take.
const fin = (v) => v !== null && v !== "" && Number.isFinite(Number(v));
export function customDomainOptions(customLayers) {
  const out = [];
  for (const L of customLayers || []) {
    const rows = (Array.isArray(L?.rows) ? L.rows : []).filter((r) => r?.hole_id != null && fin(r.from) && fin(r.to) && Number(r.to) > Number(r.from));
    if (rows.length < 2) continue;
    const fields = new Set();
    for (const r of rows.slice(0, 500)) for (const k of Object.keys(r)) if (!["hole_id", "from", "to", "depth", "_src"].includes(k)) fields.add(k);
    for (const f of fields) {
      let filled = 0, numeric = 0;
      const distinct = new Set();
      for (const r of rows) { const v = r[f]; if (v == null || v === "") continue; filled++; if (fin(v)) numeric++; distinct.add(String(v).trim()); if (distinct.size > 30) break; }
      if (filled < 0.5 * rows.length || distinct.size < 2 || distinct.size > 30 || distinct.size > 0.5 * filled || numeric > 0.5 * filled) continue; // codes repeat; free text does not
      out.push({ key: `custom:${L.id ?? L.name}:${f}`, label: `${L.name || "Custom layer"} · ${f}`, rows: rows.map((r) => ({ hole_id: r.hole_id, from: Number(r.from), to: Number(r.to), value: r[f] == null || r[f] === "" ? null : String(r[f]).trim() })).filter((r) => r.value != null) });
    }
  }
  return out;
}

// TASKS.csv #1515 (review #1497, Lawyers) — a built-in interval layer is a domain only when its values are categories: Geotech (RQD%) as a
// domain made 640 'domains' ('100', '96.67' ...) and a 17.7 s freeze, and broke composites at every RQD change. Mostly numbers: not offered.
export function isCategoricalLayer(rows, sample = 2000) {
  let filled = 0, numeric = 0;
  for (const r of (rows || []).slice(0, sample)) { const v = r?.value; if (v == null || v === "") continue; filled++; if (fin(v)) numeric++; }
  return filled > 0 && numeric <= 0.5 * filled;
}
// #1515 — domain rows indexed by hole once, sorted by from; a midpoint is then found by binary search (the lookup filtered every domain
// row for each of Lawyers' 83,670 segments: 3-17 s per domain)
export function domainIndex(domainRows) {
  const m = new Map();
  for (const r of domainRows || []) { if (r?.hole_id == null || !(Number(r.to) > Number(r.from))) continue; if (!m.has(r.hole_id)) m.set(r.hole_id, []); m.get(r.hole_id).push(r); }
  for (const list of m.values()) list.sort((a, b) => a.from - b.from);
  return m;
}
export function domainAtMid(index, hole_id, from, to) {
  const rows = index?.get(hole_id);
  if (!rows) return null;
  const mid = (from + to) / 2;
  let lo = 0, hi = rows.length - 1, at = -1;
  while (lo <= hi) { const k = (lo + hi) >> 1; if (rows[k].from <= mid) { at = k; lo = k + 1; } else hi = k - 1; }
  for (let k = at; k >= 0 && k >= at - 3; k--) if (mid >= rows[k].from && mid < rows[k].to) return rows[k].value; // a few back, for overlapping rows
  return null;
}
