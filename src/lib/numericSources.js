// TASKS.csv #1741 / #1708 (review #1645, Copley) — a numeric downhole log (mag susc, SG, RQD, recovery) or a numeric field of a
// custom layer (a SWIR white-mica wavelength, a QuickLog chalcopyrite %) can be estimated into a block model or shelled like a
// grade. The rows are turned into assay-shaped intervals under one "element" so the estimation, compositing, capping and
// variogram code runs unchanged. Values are used as logged: the import never rescales a susceptibility, so the unit label
// says "SI" and the dialogs say "as logged". Pure.
import { numericLayerFields } from "./evidenceSources.js";
import { isNumericLayer } from "./domainLayers.js";

export const LOG_SOURCES = {
  magsusc: { label: "Mag. susc.", unit: "SI", logScale: true },
  sg: { label: "Specific gravity", unit: "g/cc", logScale: false },
  geotech: { label: "RQD", unit: "%", logScale: false },
  recovery: { label: "Recovery", unit: "%", logScale: false },
};
export const CUSTOM_UNIT = "as logged";
export const POINT_SUPPORT_M = 1; // a depth-only reading stands for this much core (less when the readings are closer)
const MIN_ROWS = 3;

const num = (v) => { const n = typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v); return Number.isFinite(n) ? n : NaN; };
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

// -> [{ key, label, symbol, unit, n, logScale, field, layerKey | layerId }]: the built-in numeric logs, then every numeric field
// of every custom layer (its value column when that is numeric, then the extra numeric columns), by layer name
export function numericSourceChoices({ layers, customLayers } = {}) {
  const out = [];
  for (const [k, m] of Object.entries(LOG_SOURCES)) {
    const n = (layers?.[k] || []).filter((r) => Number.isFinite(num(r.value))).length;
    if (n >= MIN_ROWS) out.push({ key: `log:${k}`, label: m.label, symbol: m.label, unit: m.unit, n, logScale: m.logScale, field: "value", layerKey: k });
  }
  for (const c of [...(customLayers || [])].sort(byName)) {
    const rows = c.rows || [];
    const fields = numericLayerFields(rows, { min: MIN_ROWS }).filter((f) => f !== "from" && f !== "to" && f !== "value");
    if (isNumericLayer(rows)) fields.unshift("value");
    for (const f of fields) {
      const n = rows.filter((r) => Number.isFinite(num(r[f]))).length;
      if (n < MIN_ROWS) continue;
      const label = f === "value" ? String(c.name) : `${c.name} › ${f}`;
      out.push({ key: `custom:${c.id}:${f}`, label, symbol: label, unit: CUSTOM_UNIT, n, logScale: false, field: f, layerId: c.id });
    }
  }
  return out;
}

export function findNumericSource(key, ctx) {
  if (typeof key !== "string" || !(key.startsWith("log:") || key.startsWith("custom:"))) return null;
  return numericSourceChoices(ctx).find((s) => s.key === key) || null;
}

// the median gap between a hole's depth-only readings, over every hole (NaN with no pairs)
function medianPointSpacing(rows) {
  const byHole = new Map();
  for (const r of rows) (byHole.get(r.hole_id) || byHole.set(r.hole_id, []).get(r.hole_id)).push(r.depth);
  const gaps = [];
  for (const ds of byHole.values()) { ds.sort((a, b) => a - b); for (let i = 1; i < ds.length; i++) if (ds[i] > ds[i - 1]) gaps.push(ds[i] - ds[i - 1]); }
  if (!gaps.length) return NaN;
  gaps.sort((a, b) => a - b);
  return gaps[(gaps.length - 1) >> 1]; // the lower median: dense readings get the shorter support
}

// The source's rows as assay-shaped intervals: { hole_id, from, to, values: { [symbol]: v }, source: "log" }. An interval row
// keeps its from / to; a depth-only reading is given `pointSupport` m of core centred on its depth (or the readings' own median
// spacing when that is shorter), so the estimation can length-weight it like any other sample instead of dropping it as zero-length.
export function sourceAssays(choice, { layers, customLayers } = {}, { pointSupport = POINT_SUPPORT_M } = {}) {
  const rows = choice.layerKey ? layers?.[choice.layerKey] || [] : (customLayers || []).find((c) => c.id === choice.layerId)?.rows || [];
  const symbol = choice.symbol, field = choice.field || "value";
  const pointRows = [];
  const assays = [];
  let skipped = 0;
  for (const r of rows) {
    const v = num(r[field]);
    if (!Number.isFinite(v) || r.hole_id == null) { skipped++; continue; }
    const from = num(r.from), to = num(r.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) { assays.push({ hole_id: r.hole_id, from, to, values: { [symbol]: v }, source: "log" }); continue; }
    const d = Number.isFinite(from) && from === to ? from : num(r.depth);
    if (!Number.isFinite(d)) { skipped++; continue; }
    pointRows.push({ hole_id: r.hole_id, depth: d, v });
  }
  let support = pointSupport;
  if (pointRows.length) {
    const sp = medianPointSpacing(pointRows);
    if (Number.isFinite(sp) && sp < support) support = Math.max(0.1, sp);
    for (const p of pointRows) assays.push({ hole_id: p.hole_id, from: p.depth - support / 2, to: p.depth + support / 2, values: { [symbol]: p.v }, source: "log" });
  }
  return { assays, assayElements: [{ symbol, unit: choice.unit }], symbol, unit: choice.unit, pointRows: pointRows.length, pointSupport: pointRows.length ? support : null, skipped };
}

// log10 of the sample values, for an estimate that is a geometric mean per block (susceptibility varies over decades, so an
// arithmetic average of neighbours is dominated by the one magnetite-rich reading). Values at or below zero are floored at
// half the smallest positive value and counted.
export function logPoints(points) {
  let minPos = Infinity;
  for (const p of points) if (p.value > 0 && p.value < minPos) minPos = p.value;
  const floor = Number.isFinite(minPos) ? minPos / 2 : 1e-6;
  let belowFloor = 0;
  const out = points.map((p) => { let v = p.value; if (!(v > floor)) { if (v <= 0 || v < floor) belowFloor++; v = floor; } return { ...p, value: Math.log10(v) }; });
  return { points: out, floor, belowFloor };
}
export const unlogValue = (v) => 10 ** v;
// a dense grid's values back to data units, in place (NaN = no data stays NaN)
export function unlogGrid(grid) {
  const v = grid?.values;
  if (!v) return grid;
  for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i])) v[i] = 10 ** v[i];
  return grid;
}
