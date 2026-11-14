// TASKS.csv #2968 (review #2876, WA iron) — "Composite to the assay intervals": a log already in the project (a built-in Mag. susc. / SG, or a
// log imported on 0.5 m bins) averaged over each assay sample of its hole, after its valid range and despike (#2953 / #3116), and written as a
// numeric layer that Estimation, Grade shell, Geochem X-Y and Statistics read like any other (numericSources). The import's own 'the assay
// intervals' bin (#3039) does the same at import, on the raw readings only.
// Each reading goes to the sample holding its middle (downholeLogs assayIndex: pXRF left out, as the log-vs-assay pairing does); a sample's
// value is the length-weighted mean of its readings, with their min, max and count. A sample whose readings cover less than `minCover` of
// its length is left out (counted in `thin`): one 0.5 m bin is not a 2 m sample's density. Loaded on use (the pane's button).
import { assayIndex } from "./downholeLogs.js";

// data: sourceAssays(choice, ...) -> { assays: [{ hole_id, from, to, values: { [symbol]: v } }], symbol }; assays: the project's samples.
// -> { rows: [{ hole_id, from, to, value, min, max, n }] sorted by hole and depth, samples, readings, thin, unsampled }
export function compositeLogToAssays(data, assays, { minCover = 0.5 } = {}) {
  const rows = data?.assays || [], symbol = data?.symbol;
  const idx = assayIndex(rows, symbol, assays || []);
  const by = new Map(); // assay row -> { sv, sl, n, min, max }
  let unsampled = 0, readings = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], v = r.values?.[symbol];
    if (!Number.isFinite(v)) continue;
    const hit = idx.hits[i];
    if (!hit) { unsampled++; continue; }
    const len = r.to > r.from ? r.to - r.from : 0;
    const w = len > 0 ? len : 1;
    const e = by.get(hit);
    if (e) { e.sv += v * w; e.sw += w; e.sl += len; e.n++; if (v < e.min) e.min = v; if (v > e.max) e.max = v; }
    else by.set(hit, { sv: v * w, sw: w, sl: len, n: 1, min: v, max: v });
    readings++;
  }
  const out = [];
  let thin = 0;
  for (const [a, e] of by) {
    const from = Number(a.from), to = Number(a.to), L = to - from;
    if (L > 0 && e.sl / L < minCover) { thin++; continue; }
    out.push({ hole_id: String(a.hole_id), from, to, value: e.sv / e.sw, min: e.min, max: e.max, n: e.n });
  }
  out.sort((p, q) => (p.hole_id < q.hole_id ? -1 : p.hole_id > q.hole_id ? 1 : p.from - q.from || p.to - q.to));
  return { rows: out, samples: out.length, readings, thin, unsampled };
}

// the new layer's name: '<log> on assay intervals', made unique against the project's custom layers (project data: English)
export function compositeLayerName(symbol, customLayers = []) {
  const base = `${symbol} on assay intervals`;
  const taken = new Set((customLayers || []).map((c) => c.name));
  if (!taken.has(base)) return base;
  for (let k = 2; ; k++) if (!taken.has(`${base} (${k})`)) return `${base} (${k})`;
}

// the layer's notes: what it is and what was left out (project data: English, as the import's #3039 note)
export function compositeNotes(label, res, { minCover = 0.5, despikeM = 0, outOfRange = 0 } = {}) {
  return [
    `Composited from ${label} to the assay sample intervals: the length-weighted mean of the readings in each sample (fields min, max, n), ${res.readings} reading(s) into ${res.samples} sample(s).`,
    res.thin ? `${res.thin} sample(s) with readings over less than ${Math.round(minCover * 100)} % of their length were left out.` : "",
    res.unsampled ? `${res.unsampled} reading(s) in no sample were left out.` : "",
    outOfRange ? `${outOfRange} reading(s) outside the log's valid range were left out first.` : "",
    despikeM > 0 ? `The readings were despiked first (a ${despikeM} m moving median).` : "",
  ].filter(Boolean).join(" ");
}
