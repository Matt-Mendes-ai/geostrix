// TASKS.csv #2658 (follow-up of #2459; review #2325 WA uranium) — one value per hole gridded and contoured on the Maps plan: the highest
// value, the length-weighted mean of the hole, or the depth of the first interval at or over a threshold, of an assay element or of a
// numeric downhole log / custom layer field (lib/numericSources.js), placed at the collar and handed to the surface-sample gridding
// (lib/sampleGrid.js gridSamples: IDW, minimum curvature or natural neighbour, blanking, log10), so the result is the same kind of
// raster as a soil grid and gets its contours and figure legend. A hole with no value (no interval at or over the threshold) gives no
// point: it is not a zero. Pure.
import { perHoleAssay } from "./collarMapStyle.js";
import { numericSourceChoices, sourceAssays } from "./numericSources.js";
import { desurveyHole, pointOnTrace } from "./desurvey.js"; // TASKS.csv #2745

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
// verticalDepth (#2745): a 'firstOver' depth measured vertically below the collar
export function holeValueMeta(source, stat, threshold, { verticalDepth = false } = {}) {
  const unit = stat === "firstOver" ? "m" : source?.unit || "";
  const what = stat === "max" ? `highest ${source.symbol}` : stat === "mean" ? `${source.symbol} length-weighted mean` : `${verticalDepth ? "vertical depth" : "depth"} to ${source.symbol} >= ${threshold}${source.unit ? ` ${source.unit}` : ""}`;
  return { unit, what };
}

// TASKS.csv #2745 (follow-up of #2658) — where a hole's value sits down the hole, so it can be placed there in plan rather than at the
// collar (an inclined hole's intercept can be hundreds of metres from it): the interval the value came from. max: the highest interval
// (the shallowest of equal ones); firstOver: the shallowest interval at or over the threshold; mean: the span of the hole's valued
// intervals. -> Map(hole_id -> { from, to })
export function perHoleSpan(rows, symbol, stat = "max", { threshold = NaN } = {}) {
  const out = new Map(), t = num(threshold), best = new Map();
  for (const r of rows || []) {
    const v = num(r?.values?.[symbol]), from = num(r?.from), to = num(r?.to);
    if (r?.hole_id == null || !Number.isFinite(v) || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (stat === "mean") { const s = out.get(r.hole_id); out.set(r.hole_id, s ? { from: Math.min(s.from, from), to: Math.max(s.to, to) } : { from, to }); continue; }
    if (stat === "firstOver" && !(Number.isFinite(t) && v >= t)) continue;
    const b = best.get(r.hole_id);
    const better = !b || (stat === "firstOver" ? from < b.from : v > b.v || (v === b.v && from < b.from));
    if (better) { best.set(r.hole_id, { v, from }); out.set(r.hole_id, { from, to }); }
  }
  return out;
}

// the holes as samples placed at the intercept (at "intercept"): each at the middle of its span on its desurveyed trace (lib/desurvey.js);
// a hole whose trace cannot be built stays at its collar and is counted. at "collar": every hole at its collar (as holeSamples). verticalDepth (a 'firstOver' depth): the value becomes the vertical depth below
// the collar of the interval's top, not the depth along the hole. -> { samples, atCollar }
export function holeSamplesAt(collars, values, spans, { key = "value", survey = [], desurveyMethod, verticalDepth = false, at = "intercept" } = {}) {
  const bySurvey = new Map();
  for (const s of survey || []) (bySurvey.get(s.hole_id) || bySurvey.set(s.hole_id, []).get(s.hole_id)).push(s);
  const samples = [];
  let atCollar = 0;
  for (const c of collars || []) {
    let v = values.get(c?.hole_id);
    if (!Number.isFinite(v) || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const span = spans.get(c.hole_id);
    let tr = [];
    try { tr = span && (at === "intercept" || verticalDepth) ? desurveyHole(c, bySurvey.get(c.hole_id) || [], desurveyMethod) || [] : []; } catch { tr = []; }
    const mid = at === "intercept" && tr.length ? pointOnTrace(tr, (span.from + span.to) / 2) : null;
    if (verticalDepth) {
      const top = tr.length ? pointOnTrace(tr, span.from) : null;
      if (top && Number.isFinite(top.z) && Number.isFinite(c.z)) v = c.z - top.z; // z up: the collar's elevation minus the interval top's
    }
    if (mid && Number.isFinite(mid.x) && Number.isFinite(mid.y)) samples.push({ x: mid.x, y: mid.y, values: { [key]: v }, hole_id: c.hole_id });
    else { if (at === "intercept") atCollar++; samples.push({ x: c.x, y: c.y, values: { [key]: v }, hole_id: c.hole_id }); }
  }
  return { samples, atCollar };
}
