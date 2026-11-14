// TASKS.csv #3116 / #3288 / #3241 — a log's valid range and despike, on their own: the 3D View imports withFilteredLogs, and numericSources.js' other imports would join the
// startup bundle with it. logFilterOf (an entry's range / despike), movingMedian (the despike), filterLogRows (rows as every tool reads them), withFilteredLogs (the built-in
// logs' rows through it, for the 3D ribbons). numericSources.js re-exports them.
const num = (v) => { const n = typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v); return Number.isFinite(n) ? n : NaN; };
export function logFilterOf(entry) {
  const r = Array.isArray(entry?.range) ? entry.range.map(num) : null, d = num(entry?.despikeM);
  return { ...(r && (Number.isFinite(r[0]) || Number.isFinite(r[1])) ? { validRange: r } : {}), ...(d > 0 ? { despikeM: d } : {}) };
}

// TASKS.csv #3116 — the despike: each reading replaced by the median of its hole's readings within ±windowM / 2 of its depth (an interval's middle,
// or the depth of a point reading), the lower middle one of an even count. A lone spike takes its neighbours' level; a reading alone in its
// window keeps its value. kept: [[row, v]]
export function movingMedian(kept, windowM) {
  const out = new Float64Array(kept.length), byHole = new Map(), h = windowM / 2;
  const depth = kept.map(([r]) => { const f = num(r.from), t = num(r.to); return Number.isFinite(f) && Number.isFinite(t) ? (f + t) / 2 : num(r.depth); });
  kept.forEach(([r, v], i) => { if (!Number.isFinite(depth[i])) { out[i] = v; return; } const k = String(r.hole_id); (byHole.get(k) || byHole.set(k, []).get(k)).push(i); }); // no depth: as read (skipped later)
  for (const idx of byHole.values()) {
    idx.sort((a, b) => depth[a] - depth[b]);
    let lo = 0, hi = 0;
    for (let k = 0; k < idx.length; k++) {
      const d = depth[idx[k]];
      while (depth[idx[lo]] < d - h) lo++;
      while (hi < idx.length && depth[idx[hi]] <= d + h) hi++;
      const w = []; for (let j = lo; j < hi; j++) w.push(kept[idx[j]][1]);
      w.sort((a, b) => a - b);
      out[idx[k]] = w[(w.length - 1) >> 1]; // the LOWER middle of an even count: always a reading, and a lone spike never averaged into its neighbours
    }
  }
  return out;
}

// TASKS.csv #3288 (#3241) — a log's rows as every other tool reads them: readings outside the valid range left out, the despike applied to the value. entry: { range,
// despikeM } (project.logValidRange[key] for a built-in log, the layer's validRange / despikeM for an imported one); field: the value's column. Rows are copied, not edited.
// -> { rows, outOfRange, validRange, despikeM }
export function filterLogRows(rows, entry, field = "value") {
  const f = logFilterOf(entry), vr = f.validRange || null, despikeM = f.despikeM || 0;
  const outside = vr ? (v) => (Number.isFinite(vr[0]) && v < vr[0]) || (Number.isFinite(vr[1]) && v > vr[1]) : null;
  let outOfRange = 0;
  const kept = [];
  for (const r of rows || []) {
    const v = num(r[field]);
    if (!Number.isFinite(v)) { kept.push([r, NaN]); continue; }
    if (outside && outside(v)) { outOfRange++; continue; }
    kept.push([r, v]);
  }
  const finite = kept.filter(([, v]) => Number.isFinite(v)), vals = despikeM ? movingMedian(finite, despikeM) : null;
  let i = 0;
  const out = kept.map(([r, v]) => (Number.isFinite(v) && vals ? { ...r, [field]: vals[i++] } : r));
  return { rows: out, outOfRange, ...(vr ? { validRange: vr } : {}), ...(despikeM ? { despikeM } : {}) };
}

// TASKS.csv #3241 — the layers with the built-in logs' (Mag. susc., SG) rows filtered by project.logValidRange, for the 3D View's ribbons. The same object comes back
// when no log has a range or a despike; a filtered array is cached per source array and entry, so an unrelated layer change keeps its identity (the scene rebuilds only what moved).
const sceneLogCache = new WeakMap();
export function withFilteredLogs(layers, logValidRange, keys = ["magsusc", "sg"]) {
  if (!layers || !logValidRange) return layers;
  let out = layers;
  for (const k of keys) {
    const f = logFilterOf(logValidRange[k]);
    if (!layers[k]?.length || (!f.validRange && !f.despikeM)) continue;
    const id = JSON.stringify(f);
    let hit = sceneLogCache.get(layers[k]);
    if (!hit || hit.id !== id) { hit = { id, rows: filterLogRows(layers[k], logValidRange[k]).rows }; sceneLogCache.set(layers[k], hit); }
    if (out === layers) out = { ...layers };
    out[k] = hit.rows;
  }
  return out;
}
