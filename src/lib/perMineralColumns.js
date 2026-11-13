// TASKS.csv #3205 (Matt's decision 2026-11-13, "follow our recommendations"; design: docs/ideas/mineral-percent-logs.md) — a mineralization log
// in visual per cent per mineral (MN_CPY_pct, MN_BN_pct, MN_PY_pct …, no code column) had no home: the Mineralization layer demands a code, and
// the way in was one custom-layer import per mineral, each saying "N blank code" for the rows with none of that mineral. Now one import makes
// one numeric interval custom layer per ticked mineral column, plus, opt-in, a total of the columns the user ticks as sulphides.
// Pure: detection, the default ticks, and the rows of each layer. Loaded on demand (the dialog box and the commit), not at startup.

// a per-cent column name: MN_CPY_pct, CPY_PCT, Cpy%, Cpy (%), pct_cpy, CPY_VIS_PCT, Py_percent
const PCT_NAME = /(^|[\s_-])(pct|percent|perc|vis_?pct)$|^(pct|percent)[\s_-]|%\)?$|\(\s*%\s*\)$/i;
const IGNORED = /^(hole|hole_?id|holeid|bhid|from|to|depth|sample|sample_?id)$/i;
export const isPercentColumn = (h) => PCT_NAME.test(String(h ?? "").trim()) && !IGNORED.test(String(h ?? "").trim());

export function percentNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const x = Number(s.replace(/%$/, "").trim());
  return Number.isFinite(x) ? x : NaN;
}

// the style / habit text column beside a mineral column: MN_CPY_pct -> MN_CPY_style (any case), or null
export function styleColumnFor(col, headers) {
  const stem = String(col).replace(/[\s_-]*(vis_?pct|pct|percent|perc)$/i, "").replace(/[\s_-]*\(?\s*%\s*\)?$/, "").trim();
  if (!stem || stem === col) return null;
  const want = new Set(["style", "habit", "form", "occurrence", "occ"].map((w) => `${stem}_${w}`.toLowerCase()));
  return (headers || []).find((h) => want.has(String(h).trim().toLowerCase().replace(/[\s-]+/g, "_"))) || null;
}

// the per-cent columns of the file (not mapped as the hole / from / to), in file order -> [{ col, n, max, style }]; blank ones have n 0
export function percentColumns(headers, rows, mapping = {}, { sample = 200000 } = {}) {
  const used = new Set([mapping.hole_id, mapping.from, mapping.to, mapping.depth].filter(Boolean));
  const list = (headers || []).filter((h) => !used.has(h) && isPercentColumn(h));
  const step = Math.max(1, Math.floor((rows || []).length / sample));
  return list.map((col) => {
    let n = 0, max = -Infinity;
    for (let i = 0; i < (rows || []).length; i += step) { const x = percentNumber(rows[i]?.[col]); if (Number.isFinite(x)) { n++; if (x > max) max = x; } }
    return { col, n: step > 1 ? n * step : n, max: n ? max : null, style: styleColumnFor(col, headers) };
  });
}

// the box is offered for an interval table (hole, from, to) guessed as Mineralization or Custom layer, with no code column chosen for
// Mineralization, and at least two per-cent columns with values -> the columns, or null
export function perMineralOffer(target, headers, rows, mapping = {}) {
  if (target !== "mnlgy" && target !== "custom") return null;
  if (!mapping.hole_id || !mapping.from || !mapping.to || mapping.depth) return null;
  const cols = percentColumns(headers, rows, mapping);
  // a code column: the Mineralization layer as before. The guess (#2889) can take a mineral's own style column (MN_CPY_style: diss, vein …) as the
  // code: that is a property of one mineral, not a mineralization code, so the box is still offered
  if (target === "mnlgy" && mapping.value && !isPercentColumn(mapping.value) && !cols.some((c) => c.style === mapping.value)) return null;
  return cols.filter((c) => c.n > 0).length >= 2 ? cols : null;
}

// what the dialog's choices are: the ticked mineral columns (default: every column with values) and the columns summed as sulphides
// (opt-in: none by default) -> { cols: [...], sum: [...] }
export function perMineralChoice(modal, cols) {
  const withValues = (cols || []).filter((c) => c.n > 0).map((c) => c.col);
  const ticked = (modal?.mineralCols ?? withValues).filter((c) => withValues.includes(c));
  const sum = (modal?.mineralSum || []).filter((c) => withValues.includes(c));
  return { cols: ticked, sum };
}

const MAX_PCT = 100;
// one mineral's rows: an interval with a number for that mineral, 0-100; the style column rides along as a text field
// -> { rows: [{ hole_id, from, to, value, [style]: text }], none: intervals with no value of it, outside: values below 0 or over 100 }
export function mineralRows(allRows, mapping, col, style = null) {
  const rows = []; let none = 0, outside = 0;
  for (const r of allRows || []) {
    const hole_id = String(r?.[mapping.hole_id] ?? "").trim(), from = Number(r?.[mapping.from]), to = Number(r?.[mapping.to]);
    if (!hole_id || !Number.isFinite(from) || !Number.isFinite(to) || String(r?.[mapping.from] ?? "").trim() === "" || String(r?.[mapping.to] ?? "").trim() === "") continue;
    const v = percentNumber(r[col]);
    if (!Number.isFinite(v)) { none++; continue; }
    if (v < 0 || v > MAX_PCT) { outside++; continue; }
    const row = { hole_id, from, to, value: v };
    if (style) { const s = String(r[style] ?? "").trim(); if (s) row[style] = s; }
    rows.push(row);
  }
  return { rows, none, outside };
}

// the total of the ticked sulphide columns per interval: an interval with a number in any of them (a blank one counts as none logged, 0);
// a column's value outside 0-100 leaves the interval out (counted), and a total over 100 too -> { rows, none, outside }
export function sumRows(allRows, mapping, cols) {
  const rows = []; let none = 0, outside = 0;
  for (const r of allRows || []) {
    const hole_id = String(r?.[mapping.hole_id] ?? "").trim(), from = Number(r?.[mapping.from]), to = Number(r?.[mapping.to]);
    if (!hole_id || !Number.isFinite(from) || !Number.isFinite(to) || String(r?.[mapping.from] ?? "").trim() === "" || String(r?.[mapping.to] ?? "").trim() === "") continue;
    let any = false, bad = false, total = 0;
    for (const c of cols) { const v = percentNumber(r[c]); if (!Number.isFinite(v)) continue; any = true; if (v < 0 || v > MAX_PCT) bad = true; total += v; }
    if (!any) { none++; continue; }
    if (bad || total > MAX_PCT) { outside++; continue; }
    rows.push({ hole_id, from, to, value: Math.round(total * 1e6) / 1e6 });
  }
  return { rows, none, outside };
}

export const UNIT = "% (visual)";
// layer names (project text, English): the column is the name, no abbreviation table assumed; the unit, % (visual), is the layer's own, which
// the legend and labels add (in the name too it read "MN_CPY_pct (% visual) (% (visual))")
export const mineralLayerName = (base, col) => `${base}: ${col}`;
export const sumLayerName = (base, cols) => `${base}: total of ${cols.join(" + ")}`;

// the layers of a plan (the commit's work, here so it loads on demand): -> { layers: [{ name, rows, notes }], made: [label: count], outside }
export function perMineralLayers(allRows, mapping, plan, fileName, totalLabel = (cols) => `total of ${cols.join(" + ")}`) {
  const base = String(fileName).replace(/\.(csv|txt|xlsx?)$/i, "");
  const layers = [], made = []; let outside = 0;
  const push = (name, rows, notes, label) => { for (const r of rows) r._src = fileName; layers.push({ name, rows, notes }); made.push(`${label}: ${rows.length.toLocaleString()}`); };
  for (const { col, style } of plan.cols) {
    const out = mineralRows(allRows, mapping, col, style);
    outside += out.outside;
    if (out.rows.length) push(mineralLayerName(base, col), out.rows, `Visual estimate logged as a per cent of each interval (column ${col}${style ? `; ${style} kept on each interval` : ""}). ${out.none} interval(s) with no value of it are not in this layer. Source: ${fileName}.`, col);
  }
  if (plan.sum.length) {
    const out = sumRows(allRows, mapping, plan.sum);
    outside += out.outside;
    if (out.rows.length) push(sumLayerName(base, plan.sum), out.rows, `Total per interval of ${plan.sum.join(", ")}, the columns ticked as sulphides at import (a blank column counted as none logged; an interval with none of them is not in this layer). Source: ${fileName}.`, totalLabel(plan.sum));
  }
  return { layers, made, outside };
}

// the import's plan from the dialog's data, or null when the box does not apply (or every mineral was unticked: the import is the value column)
export function mineralPlan(target, headers, allRows, mapping, data) {
  const offer = perMineralOffer(target, headers, allRows, mapping);
  if (!offer) return null;
  const { cols, sum } = perMineralChoice(data, offer);
  if (!cols.length && sum.length < 2) return null;
  return { cols: cols.map((col) => ({ col, style: offer.find((c) => c.col === col)?.style || null })), sum: sum.length >= 2 ? sum : [], blank: offer.filter((c) => !c.n).map((c) => c.col) };
}
