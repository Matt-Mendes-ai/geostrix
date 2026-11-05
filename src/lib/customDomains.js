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
