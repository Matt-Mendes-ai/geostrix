// TASKS.csv #2658 (follow-up of #2459; review #2325 WA uranium) — one value per hole gridded and contoured on the Maps plan: the highest
// value, the length-weighted mean of the hole, or the depth of the first interval at or over a threshold, of an assay element or of a
// numeric downhole log / custom layer field (lib/numericSources.js), placed at the collar and handed to the surface-sample gridding
// (lib/sampleGrid.js gridSamples: IDW, minimum curvature or natural neighbour, blanking, log10), so the result is the same kind of
// raster as a soil grid and gets its contours and figure legend. A hole with no value (no interval at or over the threshold) gives no
// point: it is not a zero. Pure.
import { perHoleAssay } from "./collarMapStyle.js";
import { numericSourceChoices, sourceAssays } from "./numericSources.js";

const num = (v) => (typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v));

// -> [{ id, symbol, unit, kind: "assay" | "log", choice? }]: the assay elements, then the numeric logs and custom layer fields
export function holeValueSources({ assayElements = [], layers = {}, customLayers = [] } = {}) {
  const out = (assayElements || []).map((e) => ({ id: `a:${e.symbol}`, symbol: e.symbol, unit: e.unit || "", kind: "assay" }));
  for (const c of numericSourceChoices({ layers, customLayers, models: false })) out.push({ id: c.key, symbol: c.symbol, unit: c.unit || "", kind: "log", choice: c });
  return out;
}

// the source's rows as assay-shaped intervals { hole_id, from, to, values: { [symbol]: v } }
export function holeValueRows(source, { assays = [], layers = {}, customLayers = [] } = {}) {
  if (!source) return [];
  return source.kind === "assay" ? assays || [] : sourceAssays(source.choice, { layers, customLayers }).assays;
}

// stat "max" | "mean" (lib/collarMapStyle.js perHoleAssay) | "firstOver": the from-depth of the shallowest interval with a value at or
// over `threshold` (a hole that never reaches it has no value). -> Map(hole_id -> value)
export function perHoleValue(rows, symbol, stat = "max", { threshold = NaN } = {}) {
  if (stat !== "firstOver") return perHoleAssay(rows, symbol, stat);
  const t = num(threshold), out = new Map();
  if (!Number.isFinite(t)) return out;
  for (const r of rows || []) {
    const v = num(r?.values?.[symbol]), from = num(r?.from);
    if (r?.hole_id == null || !Number.isFinite(v) || !Number.isFinite(from) || v < t) continue;
    const had = out.get(r.hole_id);
    if (had == null || from < had) out.set(r.hole_id, from);
  }
  return out;
}

// the holes as samples for gridSamples: { x, y, values: { [key]: v }, hole_id } at the collar, one per hole with a value
export function holeSamples(collars, values, key = "value") {
  const out = [];
  for (const c of collars || []) {
    const v = values.get(c?.hole_id);
    if (!Number.isFinite(v) || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    out.push({ x: c.x, y: c.y, values: { [key]: v }, hole_id: c.hole_id });
  }
  return out;
}

// what the grid stands for, in English (project data: the raster's name and geochem record). unit: the value's unit (metres for a depth)
export function holeValueMeta(source, stat, threshold) {
  const unit = stat === "firstOver" ? "m" : source?.unit || "";
  const what = stat === "max" ? `highest ${source.symbol}` : stat === "mean" ? `${source.symbol} length-weighted mean` : `depth to ${source.symbol} >= ${threshold}${source.unit ? ` ${source.unit}` : ""}`;
  return { unit, what };
}
