// TASKS.csv #2498 (review #2486, WA lithium) — the assay import handled its file right but said nothing of what it met on the way:
// 364,097 cells below detection (and their limits), a total_pct column it left out, 22 GRAB rows taken as drill intervals, an Fe2O3 of
// 110.9 %. These are the counts the import already has, gathered from the rows it built and the file's columns. Pure.
import { isElementColumn, isLoiHeader } from "./geochem.js"; // isLoiHeader: #2734

const NON_DRILL = /^(grab|rock(?:[\s_-]*chip)?|chip|float|outcrop|soil|stream|channel|trench|surface)$/i;
const round = (v) => Number(v.toPrecision(3));

// rows: the imported assay rows; elements: the chosen elements ({ symbol, header, mainHeader, methodCols, overLimit }); unitOf(symbol);
// headers: the file's columns; used: the columns the import read (mapping, element and method columns); allRows: the file's rows (a sample
// of them is enough to tell a numeric column)
export function assayImportFindings({ rows = [], elements = [], unitOf = () => "", headers = [], used = [], allRows = [], at = null } = {}) {
  // below detection, per element: how many, and the limit most of them were reported at ('<' stored at half the limit)
  const below = [];
  for (const e of elements) {
    const s = e.symbol, limits = new Map();
    let n = 0;
    for (const r of rows) {
      if (r?.qualifiers?.[s] !== "<") continue;
      n++;
      const v = Number(r.values?.[s]);
      if (Number.isFinite(v) && v > 0) { const L = round(v * 2); limits.set(L, (limits.get(L) || 0) + 1); }
    }
    if (n) below.push({ symbol: s, n, limit: [...limits].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, unit: unitOf(s) });
  }
  // a per-cent value over 100 in the file (a closure or unit problem), read from the column as the file gives it: an oxide stored as its
  // element (Fe2O3 110.9 % -> Fe 77.6 %) would hide it. at(r): where a file row is ('RC621 8-9 m')
  const over100 = [];
  for (const e of elements) {
    if (!e.header || String(e.unit || "").trim() !== "%") continue;
    let n = 0, max = -Infinity, atRow = null;
    for (const r of allRows) { const v = Number(String(r?.[e.header] ?? "").trim()); if (Number.isFinite(v) && v > 100) { n++; if (v > max) { max = v; atRow = r; } } }
    if (n) over100.push({ symbol: e.header, n, max: round(max), where: atRow && at ? at(atRow) : "" });
  }
  // the file's numeric columns the import did not read (and are not element columns, which the dialog offers)
  const usedSet = new Set(used.filter(Boolean));
  for (const e of elements) [e.header, e.mainHeader, e.overLimit?.header, ...(e.methodCols || []).map((m) => m.header)].forEach((h) => h && usedSet.add(h));
  const sample = allRows.slice(0, 500);
  const notImported = headers.filter((h) => {
    if (!h || usedSet.has(h) || isElementColumn(h) || isLoiHeader(h) /* #2734: 'LOI371' too */) return false; // LOI: the import's own line says it
    let filled = 0, numeric = 0;
    for (const r of sample) { const v = r?.[h]; if (v == null || String(v).trim() === "") continue; filled++; if (Number.isFinite(Number(String(v).replace(/^[<>]/, "")))) numeric++; }
    return filled > 0 && numeric >= 0.8 * filled;
  });
  // sample types that are not drill intervals (grab, rock chip, soil ...), taken in as rows of their hole
  const types = new Map();
  for (const r of rows) { const t = String(r?.sample_type ?? "").trim(); if (t && NON_DRILL.test(t)) types.set(t, (types.get(t) || 0) + 1); }
  return { below, over100, notImported, nonDrill: [...types] };
}
