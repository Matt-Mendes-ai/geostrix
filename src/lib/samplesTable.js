// TASKS.csv #1869 (review #1646, Kodiak) — on a pre-drilling project the only table a sheet could take was an empty collar table: no
// rock-chip or soil results could be listed. A samples table: the surface samples with one element, highest first (the samples an
// exploration figure lists), optionally those at or above a threshold, at most N rows. Pure.
import { valueIn, gradeUnitLabel } from "./geochem.js";

// samples: store.surfaceSamples; units: { symbol: unit }. -> { columns, rows, total, more, unitLabel }
export function samplesTableRows(samples, { symbol, units = {}, maxRows = 40, threshold = null } = {}) {
  const unit = units[symbol] || "ppm", unitLabel = gradeUnitLabel(symbol, unit);
  const f = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v).toFixed(d) : "");
  const fv = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(+v.toPrecision(3)));
  const withValue = [];
  for (const s of samples || []) {
    const v = symbol ? valueIn(s, symbol, unit, units) : null;
    if (v == null || !Number.isFinite(v)) continue;
    if (threshold != null && Number.isFinite(threshold) && v < threshold) continue;
    withValue.push([s, v]);
  }
  withValue.sort((a, b) => b[1] - a[1]);
  const lim = Math.max(1, Math.round(Number(maxRows) || 40));
  const rows = withValue.slice(0, lim).map(([s, v]) => [String(s.sample_id ?? ""), f(s.x, 0), f(s.y, 0), String(s.medium ?? ""), `${s.qualifiers?.[symbol] === "<" ? "<" : ""}${fv(v)}`]);
  return { columns: ["Sample", "Easting", "Northing", "Medium", symbol ? `${symbol} (${unitLabel})` : ""], rows, total: withValue.length, more: Math.max(0, withValue.length - rows.length), unitLabel };
}

// TASKS.csv #1869 — an empty collar table says why: the holes that have assays or logs but no collar. -> count
export function holesWithoutCollars(collars, assays, layers = {}) {
  const have = new Set((collars || []).map((c) => String(c.hole_id ?? "")));
  const missing = new Set();
  for (const a of assays || []) { const id = String(a?.hole_id ?? ""); if (id && !have.has(id)) missing.add(id); }
  for (const rows of Object.values(layers || {})) if (Array.isArray(rows)) for (const r of rows) { const id = String(r?.hole_id ?? ""); if (id && !have.has(id)) missing.add(id); }
  return missing.size;
}
