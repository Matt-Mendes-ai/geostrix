// TASKS.csv #2658 (follow-up of #2459; review #2325 WA uranium) — one value per hole gridded and contoured on the Maps plan: the highest
// value, the length-weighted mean of the hole, or the depth of the first interval at or over a threshold, of an assay element or of a
// numeric downhole log / custom layer field (lib/numericSources.js), placed at the collar and handed to the surface-sample gridding
// (lib/sampleGrid.js gridSamples: IDW, minimum curvature or natural neighbour, blanking, log10), so the result is the same kind of
// raster as a soil grid and gets its contours and figure legend. A hole with no value (no interval at or over the threshold) gives no
// point: it is not a zero. Pure.
import { perHoleAssay } from "./collarMapStyle.js";
import { numericSourceChoices, sourceAssays } from "./numericSources.js";
import { desurveyHole, pointOnTrace } from "./desurvey.js"; // TASKS.csv #2745
import { domainLayerChoices } from "./domainLayers.js"; // TASKS.csv #2991
import { numericLayerFields } from "./evidenceSources.js"; // TASKS.csv #2991

const num = (v) => (typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v));

// -> [{ id, symbol, unit, kind: "assay" | "log" | "coded", choice?, rows?, codes? }]: the assay elements, then the numeric logs and custom layer
// fields, then (TASKS.csv #2991, WA iron review) the numeric extra fields of the built-in coded logs (a strand log's Met_CLA_pct) and the
// CODED logs themselves (a strand, a lithology, a custom coded layer), for the thickness, depth and RL maps a bedded deposit is drawn
// with. labelOf(key): a built-in layer's name.
const BUILT_IN_CODED = ["litho", "alt", "vein", "breccia", "weath", "structzone"];
// logValidRange: TASKS.csv #3116 — the built-in logs' range / despike (project.logValidRange), carried by the choice; `label` says so
export function holeValueSources({ assayElements = [], layers = {}, customLayers = [], labelOf = (k) => k, logValidRange = null } = {}) {
  const out = (assayElements || []).map((e) => ({ id: `a:${e.symbol}`, symbol: e.symbol, unit: e.unit || "", kind: "assay" }));
  for (const c of numericSourceChoices({ layers, customLayers, models: false, logValidRange })) out.push({ id: c.key, symbol: c.symbol, label: c.label, unit: c.unit || "", kind: "log", choice: c });
  for (const k of BUILT_IN_CODED) {
    const rows = layers?.[k] || [];
    if (!rows.length) continue;
    for (const f of numericLayerFields(rows, { min: 3 }).filter((x) => x !== "from" && x !== "to" && x !== "value" && x !== "depth")) {
      const symbol = `${labelOf(k)} › ${f}`;
      out.push({ id: `logf:${k}:${f}`, symbol, unit: "as logged", kind: "log", choice: { key: `logf:${k}:${f}`, label: symbol, symbol, unit: "as logged", field: f, layerKey: k } });
    }
  }
  for (const d of domainLayerChoices(layers, customLayers, labelOf)) {
    const count = new Map();
    for (const r of d.rows) { const v = r.value == null ? "" : String(r.value).trim(); if (v) count.set(v, (count.get(v) || 0) + 1); }
    if (!count.size) continue;
    out.push({ id: `c:${d.key}`, symbol: d.label, unit: "m", kind: "coded", rows: d.rows, codes: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => ({ code: c, n })) });
  }
  return out;
}

// TASKS.csv #2991 — a coded log's value per hole for the chosen codes (a strand, or several): stat "thick" (the summed length of their
// intervals), "top" (the depth of their shallowest top: the cover above them) or "base" (the depth of their deepest base). A hole that
// is logged in the layer but has none of the codes is 0 thick (the strand is absent: a real value on an isopach) and has no top or base;
// a hole not logged has no value. -> { values: Map(hole -> v), spans: Map(hole -> { from, to }) } (a top / base: the point, from = to)
export function perHoleCoded(rows, codes, stat = "thick") {
  const want = new Set((codes || []).map((c) => String(c).trim()));
  const logged = new Set(), acc = new Map();
  for (const r of rows || []) {
    const from = num(r?.from), to = num(r?.to);
    if (r?.hole_id == null || !Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    logged.add(r.hole_id);
    if (!want.has(String(r.value ?? "").trim())) continue;
    const a = acc.get(r.hole_id) || { len: 0, top: Infinity, base: -Infinity };
    a.len += to - from; if (from < a.top) a.top = from; if (to > a.base) a.base = to;
    acc.set(r.hole_id, a);
  }
  const values = new Map(), spans = new Map();
  for (const h of logged) {
    const a = acc.get(h);
    if (stat === "thick") { values.set(h, a ? +a.len.toFixed(3) : 0); if (a) spans.set(h, { from: a.top, to: a.base }); continue; }
    if (!a) continue;
    const d = stat === "base" ? a.base : a.top;
    values.set(h, d); spans.set(h, { from: d, to: d });
  }
  return { values, spans };
}

// the source's rows as assay-shaped intervals { hole_id, from, to, values: { [symbol]: v } }
export function holeValueRows(source, { assays = [], layers = {}, customLayers = [] } = {}) {
  if (!source || source.kind === "coded") return []; // #2991 — a coded log has codes, not values: perHoleCoded
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
// TASKS.csv #2991 — a per-hole grid's values again, from what its raster records (geochem: sourceId, stat, threshold, codes): the plan's
// figure draws the collars with them (the project file keeps no second copy). Coded RL / vertical-depth values need the desurveyed holes.
// -> Map(hole -> value)
export function perHoleValuesOf(g, { assayElements = [], layers = {}, customLayers = [], assays = [], collars = [], survey = [], desurveyMethod } = {}) {
  const src = holeValueSources({ assayElements, layers, customLayers }).find((s) => s.id === g?.sourceId);
  if (!src) return new Map();
  if (src.kind !== "coded") return perHoleValue(holeValueRows(src, { assays, layers, customLayers }), src.symbol, g.stat, { threshold: g.threshold });
  const base = g.stat === "topRL" ? "top" : g.stat === "baseRL" ? "base" : g.stat;
  const res = perHoleCoded(src.rows, g.codes || [], base);
  if (g.stat !== "topRL" && g.stat !== "baseRL" && !g.verticalDepth) return res.values;
  const placed = holeSamplesAt(collars, res.values, res.spans, { at: "collar", survey, desurveyMethod, rl: g.stat === "topRL" || g.stat === "baseRL", verticalDepth: !!g.verticalDepth });
  return new Map(placed.samples.map((p) => [p.hole_id, p.values.value]));
}

// TASKS.csv #3350 (Galore Creek review) — a grid made 'at the intercepts' drew its figure's dots at the collars, up to 220 m from the cells holding
// their value. The plan's figure needs where each hole's value was placed: the same spans the grid was made from (geochem: sourceId, stat,
// threshold, codes), the dots at the middle of the span on the desurveyed trace. -> [{ x, y, v }] (holes whose trace cannot be built stay at their collar)
export function perHoleFigureAtIntercepts(g, ctx) {
  const { assayElements = [], layers = {}, customLayers = [], assays = [], collars = [], survey = [], desurveyMethod } = ctx || {};
  const src = holeValueSources({ assayElements, layers, customLayers }).find((s) => s.id === g?.sourceId);
  if (!src) return [];
  let values, spans;
  if (src.kind !== "coded") {
    const rows = holeValueRows(src, { assays, layers, customLayers });
    values = perHoleValue(rows, src.symbol, g.stat, { threshold: g.threshold });
    spans = perHoleSpan(rows, src.symbol, g.stat, { threshold: g.threshold });
  } else {
    const base = g.stat === "topRL" ? "top" : g.stat === "baseRL" ? "base" : g.stat;
    const res = perHoleCoded(src.rows, g.codes || [], base);
    values = res.values; spans = res.spans;
  }
  const rl = g.stat === "topRL" || g.stat === "baseRL";
  return holeSamplesAt(collars, values, spans, { at: "intercept", survey, desurveyMethod, rl, verticalDepth: !!g.verticalDepth }).samples.map((p) => ({ x: p.x, y: p.y, v: p.values.value }));
}

// rl (#2991): the value becomes the elevation (RL) of the interval's top on the desurveyed trace (a hole with no trace or no collar
// elevation is left out and counted in noRl)
export function holeSamplesAt(collars, values, spans, { key = "value", survey = [], desurveyMethod, verticalDepth = false, at = "intercept", rl = false } = {}) {
  const bySurvey = new Map();
  for (const s of survey || []) (bySurvey.get(s.hole_id) || bySurvey.set(s.hole_id, []).get(s.hole_id)).push(s);
  const samples = [];
  let atCollar = 0, noRl = 0;
  for (const c of collars || []) {
    let v = values.get(c?.hole_id);
    if (!Number.isFinite(v) || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const span = spans.get(c.hole_id);
    let tr = [];
    try { tr = span && (at === "intercept" || verticalDepth || rl) ? desurveyHole(c, bySurvey.get(c.hole_id) || [], desurveyMethod) || [] : []; } catch { tr = []; }
    const mid = at === "intercept" && tr.length ? pointOnTrace(tr, (span.from + span.to) / 2) : null;
    if (verticalDepth || rl) {
      const top = tr.length ? pointOnTrace(tr, span.from) : null;
      if (rl) { if (top && Number.isFinite(top.z)) v = top.z; else { noRl++; continue; } } // #2991 — the RL of the top (or base) itself
      else if (top && Number.isFinite(top.z) && Number.isFinite(c.z)) v = c.z - top.z; // z up: the collar's elevation minus the interval top's
    }
    if (mid && Number.isFinite(mid.x) && Number.isFinite(mid.y)) samples.push({ x: mid.x, y: mid.y, values: { [key]: v }, hole_id: c.hole_id });
    else { if (at === "intercept") atCollar++; samples.push({ x: c.x, y: c.y, values: { [key]: v }, hole_id: c.hole_id }); }
  }
  return { samples, atCollar, noRl };
}

// TASKS.csv #3826 (Scottie Gold review) — holes drilled as fans from pads: the collar is the one place their values do not belong (three holes of
// 91.5, 3.72 and 20.1 g/t gave a cell of 18.98 at their pad). What the placement does to the holes: how many share a collar point (rounded to a metre),
// and how many have their value (the middle of the interval on the trace) more than a cell from the collar.
// atCollar / atIntercept: holeSamplesAt(...).samples at the two placements. -> { holes, padHoles, pads, apart, far, intercept }
// intercept: the grid is better made at the intercepts (a pad's holes part by more than a cell, or most values lie a cell or more from their collar)
export function placementAdvice(atCollar, atIntercept, cellM) {
  const cell = Number.isFinite(cellM) && cellM > 0 ? cellM : 50, list = atCollar || [], n = list.length;
  // a pad: collars within PAD_M of each other (a spatial hash, joined by union-find)
  const PAD_M = 5, parent = list.map((_, i) => i), find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const hash = new Map();
  list.forEach((s, i) => { const k = Math.floor(s.x / PAD_M) + "," + Math.floor(s.y / PAD_M); (hash.get(k) || hash.set(k, []).get(k)).push(i); });
  list.forEach((s, i) => { const cx = Math.floor(s.x / PAD_M), cy = Math.floor(s.y / PAD_M); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of hash.get((cx + dx) + "," + (cy + dy)) || []) if (j > i && Math.hypot(list[j].x - s.x, list[j].y - s.y) <= PAD_M) parent[find(j)] = find(i); });
  const byPad = new Map();
  list.forEach((s, i) => { const r = find(i); (byPad.get(r) || byPad.set(r, []).get(r)).push(s.hole_id); });
  const icpt = new Map((atIntercept || []).map((s) => [s.hole_id, s]));
  let padHoles = 0, pads = 0, apart = 0, far = 0;
  for (const s of list) { const i = icpt.get(s.hole_id); if (i && Math.hypot(i.x - s.x, i.y - s.y) > cell) far++; }
  for (const ids of byPad.values()) {
    if (ids.length < 2) continue;
    padHoles += ids.length; pads++;
    const pts = ids.map((h) => icpt.get(h)).filter(Boolean);
    let wide = false;
    for (let i = 0; i < pts.length && !wide; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > cell) { wide = true; break; }
    if (wide) apart += ids.length;
  }
  return { holes: n, padHoles, pads, apart, far, intercept: apart > 0 || (n > 0 && far * 2 > n) };
}
