// TASKS.csv #1678 (review #1645, Copley) — custom-layer categories as domains: Copley's Oxidation (O / T / S, the first domain for porphyry
// statistics and capping), QuickLog alteration and the Veins / Mineralization codes are custom layers, and Grade stats and Compositing
// offered only the built-in interval layers. Each interval custom layer's categorical fields (text codes, 2-30 distinct values, filled
// on at least half the rows, repeating: fewer values than half the rows) become a domain choice: { key: "custom:<layer id>:<field>", label: "<layer> · <field>", rows: [{ hole_id,
// from, to, value }] } - the shape the domain lookup and compositeAssays already take.
const fin = (v) => v !== null && v !== "" && Number.isFinite(Number(v));
// TASKS.csv #2349 (review #2325, WA uranium) — the codes are counted once their case is folded ('Strat unit' had 33 spellings, 25 codes:
// Dcb 665 / DCB 363 / DCb 4 ... and was dropped as over 30), and each code is spelled as most often; `builtin` ({ layers, labelOf }) adds
// the built-in logs' extra fields (Lithology's Strat, Oxidation, Lith2 were never offered): their 'value' is already a domain
const BUILTIN_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone"];
// TASKS.csv #2915 (review #2876, WA iron) — a field of more than 30 codes was dropped without a word ('Material type (dominant)', 42 codes,
// absent from Grade stats and Compositing). With { groupTop: 12 } it is offered as its 12 commonest codes (by logged length) and the rest as
// OTHER_CODES, flagged grouped: { kept, of } so the list can say so. Still a code field: codes repeat (no more distinct values than half the
// filled rows) and are not mostly numbers. Up to GROUP_MAX distinct codes; past that it is free text.
export const OTHER_CODES = "other";
const GROUP_MAX = 500;
export function customDomainOptions(customLayers, builtin = null, { groupTop = 0 } = {}) {
  const out = [];
  const extra = builtin?.layers ? BUILTIN_KEYS.filter((k) => (builtin.layers[k] || []).length).map((k) => ({ id: `layer-${k}`, name: builtin.labelOf ? builtin.labelOf(k) : k, rows: builtin.layers[k], skip: "value" })) : [];
  for (const L of [...(customLayers || []), ...extra]) {
    const rows = (Array.isArray(L?.rows) ? L.rows : []).filter((r) => r?.hole_id != null && fin(r.from) && fin(r.to) && Number(r.to) > Number(r.from));
    if (rows.length < 2) continue;
    const fields = new Set();
    for (const r of rows.slice(0, 500)) for (const k of Object.keys(r)) if (!["hole_id", "from", "to", "depth", "_src", L.skip].includes(k)) fields.add(k);
    for (const f of fields) {
      let filled = 0, numeric = 0;
      const distinct = new Set();
      const spell = new Map(); // upper-cased code -> Map(spelling -> count)
      const cap = groupTop > 0 ? GROUP_MAX : 30; // #2915 — count past 30 only when the caller groups
      const len = new Map(); // upper-cased code -> logged length (#2915: the commonest codes by core, not by row count)
      for (const r of rows) { const v = r[f]; if (v == null || v === "") continue; filled++; if (fin(v)) numeric++; const t = String(v).trim(), k = t.toUpperCase(); distinct.add(k); const m = spell.get(k) || new Map(); m.set(t, (m.get(t) || 0) + 1); spell.set(k, m); len.set(k, (len.get(k) || 0) + (Number(r.to) - Number(r.from))); if (distinct.size > cap) break; }
      const canon = new Map([...spell].map(([k, m]) => [k, [...m].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0]]));
      const canonOf = (t) => canon.get(t.toUpperCase()) || t;
      if (filled < 0.5 * rows.length || distinct.size < 2 || distinct.size > cap || distinct.size > 0.5 * filled || numeric > 0.5 * filled) continue; // codes repeat; free text does not
      const grouped = distinct.size > 30;
      const top = grouped ? new Set([...len].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, groupTop).map(([k]) => k)) : null;
      const codeOf = (t) => (grouped && !top.has(t.toUpperCase()) ? OTHER_CODES : canonOf(t));
      out.push({ key: `custom:${L.id ?? L.name}:${f}${grouped ? `:top${groupTop}` : ""}`, label: `${L.name || "Custom layer"} · ${f}`, ...(grouped ? { grouped: { kept: groupTop, of: distinct.size } } : {}), rows: rows.map((r) => ({ hole_id: r.hole_id, from: Number(r.from), to: Number(r.to), value: r[f] == null || r[f] === "" ? null : codeOf(String(r[f]).trim()) })).filter((r) => r.value != null) });
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

// TASKS.csv #2504 (review #2486, WA lithium) — the sample's type and the collar's categorical fields as domains: RC against core against
// aircore (1.33 / 0.62 / 0.01 % Li2O) was answerable only in SQL. Each becomes interval rows in the shape every domain consumer takes:
// sample type one row per assay interval (its own from-to), a collar field one row per hole spanning the whole hole. A field is offered
// with 2 to 30 distinct values (collarAttrChoices' rule) on at least half the samples / holes. -> [{ key, label, rows }]
const WHOLE_HOLE = 1e7;
export function attributeDomainOptions(assays, collars) {
  const out = [];
  const iv = (assays || []).filter((a) => a?.hole_id != null && fin(a.from) && fin(a.to) && Number(a.to) > Number(a.from));
  const types = new Set();
  let typed = 0;
  for (const a of iv) { const t = a.sample_type == null ? "" : String(a.sample_type).trim(); if (!t) continue; typed++; if (types.size <= 30) types.add(t); }
  if (types.size >= 2 && types.size <= 30 && typed >= 0.5 * iv.length) {
    out.push({ key: "attr:sample_type", label: "Sample type", attribute: true, rows: iv.filter((a) => a.sample_type != null && String(a.sample_type).trim()).map((a) => ({ hole_id: a.hole_id, from: Number(a.from), to: Number(a.to), value: String(a.sample_type).trim() })) });
  }
  const by = new Map();
  for (const c of collars || []) for (const [k, v] of Object.entries(c?.attrs || {})) {
    const t = String(v ?? "").trim(); if (!t) continue;
    if (!by.has(k)) by.set(k, { values: new Set(), n: 0 });
    const e = by.get(k); e.n++; if (e.values.size <= 30) e.values.add(t);
  }
  const nHoles = (collars || []).length;
  // a field that groups the holes exactly as one already offered (the file's Drill_Code beside the app's 'hole type': RC = Reverse
  // circulation (RC) on every hole) adds nothing: the first kept, hole type first
  const kept = [];
  const sameGrouping = (a, b) => { const ab = new Map(), ba = new Map(); for (const c of collars) { const x = String(c?.attrs?.[a] ?? "").trim(), y = String(c?.attrs?.[b] ?? "").trim(); if (ab.has(x) ? ab.get(x) !== y : ba.has(y)) return false; ab.set(x, y); ba.set(y, x); } return true; };
  for (const [k, e] of [...by.entries()].sort((a, b) => (a[0] === "hole type" ? -1 : b[0] === "hole type" ? 1 : a[0].localeCompare(b[0])))) {
    if (e.values.size < 2 || e.values.size > 30 || e.n < 0.5 * nHoles) continue;
    if (kept.some((j) => sameGrouping(j, k))) continue;
    kept.push(k);
    const rows = [];
    for (const c of collars) { const t = String(c?.attrs?.[k] ?? "").trim(); if (t) rows.push({ hole_id: c.hole_id, from: -WHOLE_HOLE, to: WHOLE_HOLE, value: t }); }
    out.push({ key: `collar:${k}`, label: `Collar · ${k}`, attribute: true, rows });
  }
  return out;
}
// the option label in the reader's language (the stored label stays English for exports): "Sample type", "Collar · hole type"
export function attributeDomainLabel(d, tr) {
  if (d?.grouped) return tr("{label}: the {kept} commonest of {n} codes, the rest as \"other\"", { label: d.label, kept: d.grouped.kept, n: d.grouped.of }); // #2915
  if (d?.key === "attr:sample_type") return tr("Sample type");
  if (String(d?.key || "").startsWith("collar:")) return tr("Collar · {field}", { field: d.key.slice(7) });
  return d?.label;
}
