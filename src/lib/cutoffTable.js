// TASKS.csv #2912 (review #2876, WA bedded iron) — Grade stats had nothing a bulk commodity is read by: the share of the samples and the
// metres above a cut-off, their mean grade and the mean of the penalty elements (SiO2, Al2O3, P for iron ore) over the same core.
// Pure functions, no deposit assumed: the cut-offs are the user's, or the data's own median / Q3 / P90 until they type some.

// The length-weighted mean of another element over each main segment: by hole, the overlap of every `other` segment with it.
// mainSegs, otherSegs: [{ hole_id, from, to, value }] (geochem.js resolvedSegments). Returns a Float64Array (NaN: nothing overlaps).
export function overlapMeans(mainSegs, otherSegs) {
  const out = new Float64Array(mainSegs.length).fill(NaN);
  const byHole = new Map();
  for (const s of otherSegs || []) {
    if (!(s.to > s.from) || !Number.isFinite(s.value)) continue;
    let a = byHole.get(s.hole_id);
    if (!a) byHole.set(s.hole_id, (a = []));
    a.push(s);
  }
  for (const a of byHole.values()) a.sort((p, q) => p.from - q.from);
  // main segments by hole, in depth order, so one forward pointer per hole walks the other element's list
  const order = new Map();
  mainSegs.forEach((s, i) => { let a = order.get(s.hole_id); if (!a) order.set(s.hole_id, (a = [])); a.push(i); });
  for (const [hole, idx] of order) {
    const other = byHole.get(hole);
    if (!other) continue;
    idx.sort((i, j) => mainSegs[i].from - mainSegs[j].from);
    let start = 0;
    for (const i of idx) {
      const m = mainSegs[i];
      while (start < other.length && other[start].to <= m.from) start++;
      let len = 0, sum = 0;
      for (let k = start; k < other.length && other[k].from < m.to; k++) {
        const o = other[k], ov = Math.min(o.to, m.to) - Math.max(o.from, m.from);
        if (ov > 0) { len += ov; sum += ov * o.value; }
      }
      if (len > 0) out[i] = sum / len;
    }
  }
  return out;
}

// One row per cut-off (ascending): n and share of the samples at or above it, their metres (null without lengths), the mean grade
// (length-weighted when `weighted`), and the mean of each `also` element over those samples (null where none has a value).
// values, lengths: arrays of the same length; also: { symbol: array of numbers or NaN, aligned with values }.
export function aboveCutoffRows(values, lengths, cutoffs, { weighted = false, also = {} } = {}) {
  const n = values.length;
  const syms = Object.keys(also);
  let totalLen = 0;
  if (lengths) for (let i = 0; i < n; i++) totalLen += lengths[i] > 0 ? lengths[i] : 0;
  return [...new Set((cutoffs || []).filter((c) => Number.isFinite(c)))].sort((a, b) => a - b).map((cut) => {
    let k = 0, len = 0, wsum = 0, vsum = 0;
    const as = syms.map(() => ({ w: 0, s: 0 }));
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (!(v >= cut)) continue;
      const L = lengths && lengths[i] > 0 ? lengths[i] : 0;
      const w = weighted ? L : 1;
      k++; len += L; wsum += w; vsum += w * v;
      for (let j = 0; j < syms.length; j++) { const x = also[syms[j]][i]; if (Number.isFinite(x)) { as[j].w += w; as[j].s += w * x; } }
    }
    return {
      cutoff: cut, n: k, pctN: n ? (100 * k) / n : 0,
      length: lengths ? len : null, pctLength: lengths && totalLen > 0 ? (100 * len) / totalLen : null,
      mean: wsum > 0 ? vsum / wsum : null,
      also: Object.fromEntries(syms.map((s, j) => [s, as[j].w > 0 ? as[j].s / as[j].w : null])),
    };
  });
}

// "50, 55; 60" -> [50, 55, 60]; anything that is not a number is dropped
export function parseCutoffs(text) {
  return String(text || "").split(/[\s,;]+/).map((t) => (t === "" ? NaN : Number(t))).filter((v) => Number.isFinite(v));
}

// The data's own median, Q3 and P90, to two significant figures, when no cut-off is typed (never a number that reads as a deposit's)
export function defaultCutoffs({ median, q3, p90 } = {}) {
  return [...new Set([median, q3, p90].filter((v) => Number.isFinite(v) && v > 0).map((v) => +v.toPrecision(2)))].sort((a, b) => a - b);
}
