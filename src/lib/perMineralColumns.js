// TASKS.csv #3205 (Matt's decision 2026-11-13, "follow our recommendations"; design: docs/ideas/mineral-percent-logs.md) — a mineralization log
// in visual per cent per mineral (MN_CPY_pct, MN_BN_pct, MN_PY_pct …, no code column) had no home: the Mineralization layer demands a code, and
// the way in was one custom-layer import per mineral, each saying "N blank code" for the rows with none of that mineral. Now one import makes
// one numeric interval custom layer per ticked mineral column, plus, opt-in, a total of the columns the user ticks as sulphides.
// Pure: detection, the default ticks, and the rows of each layer. Loaded on demand (the dialog box and the commit), not at startup.

// a per-cent column name: MN_CPY_pct, CPY_PCT, Cpy%, Cpy (%), pct_cpy, CPY_VIS_PCT, Py_percent
const PCT_NAME = /(^|[\s_-])(pct|percent|perc|vis_?pct)$|^(pct|percent)[\s_-]|%\)?$|\(\s*%\s*\)$/i;
const IGNORED = /^(hole|hole_?id|holeid|bhid|from|to|depth|sample|sample_?id)$/i;
// TASKS.csv #3307 (Matt, 2026-11-13: a logging database's assemblage table, py_sum / sph_sum / po_sum / cpy_sum / gal_sum / apy_sum / sfs_sum / au_sum,
// with py_dist / py_morph beside them) — '<mineral>_sum' is a mineral amount too, when the stem is a mineral abbreviation or the column has
// text companions (_dist, _morph …); a bare '_sum' of anything else is not
const SUM_NAME = /^(.+?)[\s_-]*(sum|total|tot|amt|amount)$/i;
const MINERAL_ABBR = new Set(["py", "pyr", "cpy", "cp", "po", "pyrr", "sph", "sp", "sl", "gal", "gn", "ga", "apy", "aspy", "asp", "sfs", "ss", "tt", "tn", "td", "mo", "mol", "moly", "bn", "cc", "cv", "en", "mt", "mag", "hem", "hm", "au", "vg", "ag", "el", "stb", "sb", "cin", "sch", "wf", "cst", "mal", "az", "ccp", "ml", "ilm", "cob", "pent", "pn"]);
const COMPANION = ["style", "habit", "form", "occurrence", "occ", "dist", "distribution", "morph", "morphology", "mode", "texture"];
const stemOf = (col) => String(col).replace(/[\s_-]*(vis_?pct|pct|percent|perc)$/i, "").replace(/[\s_-]*\(?\s*%\s*\)?$/, "").replace(/^(pct|percent)[\s_-]+/i, "").replace(/[\s_-]*(sum|total|tot|amt|amount)$/i, "").trim();
// the text columns beside a mineral column: MN_CPY_pct -> MN_CPY_style; py_sum -> py_dist, py_morph (any case)
export function companionColumns(col, headers) {
  const stem = stemOf(col);
  if (!stem || stem === col) return [];
  const want = new Set(COMPANION.map((w) => `${stem}_${w}`.toLowerCase()));
  return (headers || []).filter((h) => want.has(String(h).trim().toLowerCase().replace(/[\s-]+/g, "_")));
}
export function isSumMineralColumn(h, headers = []) {
  const m = SUM_NAME.exec(String(h ?? "").trim());
  if (!m || IGNORED.test(String(h).trim())) return false;
  const stem = m[1].replace(/^(mn|min|mnl|sul|sulph)[\s_-]+/i, "").toLowerCase();
  return MINERAL_ABBR.has(stem) || companionColumns(h, headers).length > 0;
}
export const isPercentColumn = (h) => PCT_NAME.test(String(h ?? "").trim()) && !IGNORED.test(String(h ?? "").trim());
export const isMineralAmountColumn = (h, headers = []) => isPercentColumn(h) || isSumMineralColumn(h, headers); // #3307
// the mineral's code for the Mineralization layer: MN_CPY_pct -> CPY, py_sum -> PY
export const mineralCode = (col) => stemOf(col).replace(/^(mn|min|mnl|sul|sulph)[\s_-]+/i, "").toUpperCase() || String(col).toUpperCase();

export function percentNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const x = Number(s.replace(/%$/, "").trim());
  return Number.isFinite(x) ? x : NaN;
}

// the style / habit text column beside a mineral column: MN_CPY_pct -> MN_CPY_style (any case), or null
export const styleColumnFor = (col, headers) => companionColumns(col, headers)[0] || null; // the first companion (#3307)

// the per-cent columns of the file (not mapped as the hole / from / to), in file order -> [{ col, n, max, style }]; blank ones have n 0
export function percentColumns(headers, rows, mapping = {}, { sample = 200000 } = {}) {
  const used = new Set([mapping.hole_id, mapping.from, mapping.to, mapping.depth].filter(Boolean));
  const list = (headers || []).filter((h) => !used.has(h) && isMineralAmountColumn(h, headers)); // _sum: #3307
  const step = Math.max(1, Math.floor((rows || []).length / sample));
  return list.map((col) => {
    let n = 0, max = -Infinity;
    for (let i = 0; i < (rows || []).length; i += step) { const x = percentNumber(rows[i]?.[col]); if (Number.isFinite(x)) { n++; if (x > max) max = x; } }
    const companions = companionColumns(col, headers);
    return { col, n: step > 1 ? n * step : n, max: n ? max : null, style: companions[0] || null, companions };
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
  if (target === "mnlgy" && mapping.value && !isMineralAmountColumn(mapping.value, headers) && !cols.some((c) => c.companions.includes(mapping.value))) return null;
  return cols.filter((c) => c.n > 0).length >= 2 ? cols : null;
}

// what the dialog's choices are: the ticked mineral columns (default: every column with values) and the columns summed as sulphides
// (opt-in: none by default) -> { cols: [...], sum: [...] }
// TASKS.csv #3307 — mode: "single" (Matt's default for Mineralization: one layer, coloured by mineral, Value = Total min) or "layers" (#3205: one
// numeric layer per mineral; the default for a Custom layer); colourBy: "dominant" or one of the ticked columns
export function perMineralChoice(modal, cols) {
  const withValues = (cols || []).filter((c) => c.n > 0).map((c) => c.col);
  const ticked = (modal?.mineralCols ?? withValues).filter((c) => withValues.includes(c));
  const sum = (modal?.mineralSum || []).filter((c) => withValues.includes(c));
  const mode = modal?.mineralMode || (modal?.target === "custom" ? "layers" : "single");
  const colourBy = ticked.includes(modal?.mineralColourBy) ? modal.mineralColourBy : "dominant";
  return { cols: ticked, sum, mode, colourBy };
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

export const UNIT = "% visual"; // the legend writes it in brackets: "(% visual)"
// layer names (project text, English): the column is the name, no abbreviation table assumed; the unit, % visual, is the layer's own, which
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

// TASKS.csv #3307 — the one Mineralization layer: each interval's code is its dominant mineral (or, coloured by one mineral, that mineral where it
// is logged and 'No <code>' elsewhere), its extra is Total min (the sum of the ticked minerals), and every ticked mineral and its text companions
// ride along as fields. An interval with none of them is not in the layer (counted). -> { rows, mapping, customFields, none, outside }
export const MIN_CODE_COL = "__min_code", MIN_TOTAL_COL = "__min_total";
export function singleMineralRows(allRows, mapping, plan, colourBy = "dominant") {
  const cols = plan.cols.map((c) => c.col);
  const rows = []; let none = 0, outside = 0;
  for (const r of allRows || []) {
    let total = 0, best = null, bestV = -Infinity, any = false;
    for (const c of cols) {
      const v = percentNumber(r?.[c]);
      if (!Number.isFinite(v)) continue;
      if (v < 0) { outside++; continue; }
      any = true; total += v;
      if (v > bestV) { bestV = v; best = c; }
    }
    if (!any || total <= 0) { none++; continue; }
    const code = colourBy === "dominant" ? mineralCode(best) : percentNumber(r?.[colourBy]) > 0 ? mineralCode(colourBy) : `No ${mineralCode(colourBy)}`;
    rows.push({ ...r, [MIN_CODE_COL]: code, [MIN_TOTAL_COL]: String(Math.round(total * 1e6) / 1e6) });
  }
  const customFields = [];
  for (const c of plan.cols) {
    customFields.push({ column: c.col, name: c.col, type: "number" });
    for (const t of c.companions || []) customFields.push({ column: t, name: t });
  }
  return { rows, mapping: { ...mapping, value: MIN_CODE_COL, extra: MIN_TOTAL_COL }, customFields, none, outside };
}

// the import's plan from the dialog's data, or null when the box does not apply (or every mineral was unticked: the import is the value column)
export function mineralPlan(target, headers, allRows, mapping, data) {
  const offer = perMineralOffer(target, headers, allRows, mapping);
  if (!offer) return null;
  const { cols, sum, mode, colourBy } = perMineralChoice({ ...data, target }, offer);
  if (mode === "single" ? !cols.length : !cols.length && sum.length < 2) return null;
  const pick = (col) => { const o = offer.find((c) => c.col === col); return { col, style: o?.style || null, companions: o?.companions || [] }; };
  return { mode, colourBy, cols: cols.map(pick), sum: mode === "layers" && sum.length >= 2 ? sum : [], blank: offer.filter((c) => !c.n).map((c) => c.col) };
}
