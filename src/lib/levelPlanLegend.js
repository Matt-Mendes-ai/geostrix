// TASKS.csv #1404 (review #1352, Silvertip) — the level plan's legend listed every layer whatever "Colour holes by" chose (the
// pierce points are filled by that one layer), the RQD colours had no key, and minerals came once per logged percent ("PYR (0.1%)",
// "PYR (0.3%)" ...). The legend is now the chosen layer: its categories once each (a mineral by name), or, for a numeric layer, five
// of the colours actually drawn at their values from low to high; the structure symbols drawn on the plan keep their rows.
// intervals: buildPlanPayload's [{ layer, label: "<Layer>: <value>", color }]; numeric: the layer is a number (RQD, recovery, SG)
// -> { title, items: [[label, color]], numeric }
const fmt = (v) => String(+Number(v).toPrecision(3));

export function planLegend(intervals, layer, { numeric = false } = {}) {
  const rows = (intervals || []).filter((iv) => iv.layer === layer);
  const split = (s) => { const t = String(s ?? ""), i = t.indexOf(": "); return i > 0 ? [t.slice(0, i), t.slice(i + 2)] : ["", t]; };
  const title = rows.length ? split(rows[0].label)[0] : "";
  if (numeric) {
    const pairs = rows.map((iv) => [Number(split(iv.label)[1]), iv.color]).filter(([v, c]) => Number.isFinite(v) && c).sort((a, b) => a[0] - b[0]);
    if (!pairs.length) return { title, items: [], numeric: true };
    const items = [];
    for (let k = 0; k < 5; k++) {
      const [v, c] = pairs[Math.round((k / 4) * (pairs.length - 1))];
      if (!items.some(([l]) => l === fmt(v))) items.push([fmt(v), c]);
    }
    return { title, items, numeric: true };
  }
  const seen = new Set(), items = [];
  for (const iv of rows) {
    const name = split(iv.label)[1].replace(/\s*\([\d.]+\s*%\)\s*$/, ""); // #1404 — a mineral once, not once per percent
    const k = `${name}|${iv.color}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push([name, iv.color]);
  }
  items.sort((a, b) => a[0].localeCompare(b[0]));
  return { title, items, numeric: false };
}
