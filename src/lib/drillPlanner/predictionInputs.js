// TASKS.csv #3962 (P1) — what the probable-grade panel reads and what it keeps on a planned hole. Pure.
//
// The grade model's settings come from Grade estimation's own runs (design.md 1.1): each estimated block model keeps them in its
// params (element, unit, composite length and minimum coverage, the high-grade cap, the search radius and trend, the variogram's
// model type). With no estimate for an element, the same defaults Grade estimation opens with: 2 m composites, half covered, no cap.
// A prediction is FROZEN on the hole when it is made (design.md 4.1): later data or a moved hole never change it in place; the row
// says when the hole has moved since, and a drilled hole (its as-drilled link set) keeps the prediction it had.

export const PREDICTION_VERSION = 1;

// voxelModels -> the Grade estimation runs that can set the model, newest first
export function estimateSources(voxelModels) {
  const out = [];
  for (const m of voxelModels || []) {
    const p = m?.params;
    if (!p || !String(m.source || "").startsWith("estimate-") || !p.element) continue;
    out.push({
      id: m.id, name: m.name, element: p.element, unit: p.unit || null,
      compositeLengthM: Number(p.compositeLengthM) > 0 ? Number(p.compositeLengthM) : 2,
      composited: p.composited !== false && Number(p.compositeLengthM) > 0,
      minCoverage: Number.isFinite(Number(p.minCoverage)) && p.minCoverage != null ? Number(p.minCoverage) : 0.5,
      capValue: Number(p.capValue) > 0 ? Number(p.capValue) : null,
      searchRadiusM: Number(p.searchRadiusM) > 0 ? Number(p.searchRadiusM) : null,
      searchTrend: p.searchTrend?.ratios ? p.searchTrend : null,
      vgModel: p.variogram?.model || "spherical",
    });
  }
  return out.reverse();
}

// an element with no estimate: Grade estimation's opening defaults
export const freshSource = (element, unit) => ({ id: `fit:${element}`, name: null, element, unit: unit || null, compositeLengthM: 2, composited: true, minCoverage: 0.5, capValue: null, searchRadiusM: null, searchTrend: null, vgModel: "spherical" });

// a cut-off to start from: the composites' upper quartile, to two significant figures
export function suggestedCutoff(values) {
  const v = (values || []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = v[Math.floor(0.75 * (v.length - 1))];
  return Number(q.toPrecision(2));
}

// the geometry a prediction was made for (a moved, turned or lengthened hole makes it stale)
export const holeGeometryKey = (h) => [h.x, h.y, h.z, h.azimuth, h.dip, h.length, h.lift || 0, h.drift || 0].map((v) => Math.round((Number(v) || 0) * 100) / 100).join("|");

// the data and model a prediction rests on, as a short stamp (the same composites and settings give the same stamp)
export function modelStamp(source, model, values) {
  let h = 2166136261;
  const mix = (s) => { for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } };
  mix(`${source.element}|${source.compositeLengthM}|${source.capValue}|${model.n}|${model.vg.model}|${model.vg.range.toFixed(2)}|${model.vg.nugget.toFixed(4)}`);
  let s = 0; for (const v of values || []) s += v;
  mix(s.toPrecision(10));
  return (h >>> 0).toString(36);
}

const sig = (x, n = 4) => (x == null || !Number.isFinite(x) ? x : Number(x.toPrecision(n)));
const sig3 = (a) => (a ? a.map((x) => sig(x)) : null);

// the frozen record kept on the planned hole (`prediction`)
export function predictionRecord(pred, { source, model, rules, hole, stamp, date = new Date().toISOString() }) {
  const base = {
    v: PREDICTION_VERSION, date, element: source.element, unit: source.unit, source: source.name || null,
    rules: { cutoff: rules.cutoff, minLength: rules.minLength, maxInternalDilution: rules.maxInternalDilution },
    step: pred.step, geometry: holeGeometryKey(hole), stamp,
    model: { vg: { model: model.vg.model, range: sig(model.vg.range), nugget: sig(model.vg.nugget, 3) }, n: model.n, holes: model.holes, rSquared: sig(model.fit.rSquared, 3), weak: !!model.fit.weak, trend: source.searchTrend?.name || null },
    nData: pred.nData, beyondM: pred.beyondM, lengthM: pred.lengthM,
  };
  if (pred.beyond) return { ...base, beyond: true };
  return {
    ...base, beyond: false, realizations: pred.realizations,
    pHit: sig(pred.pHit, 3), gtMean: sig(pred.gtMean), length: sig3(pred.length), gt: sig3(pred.gt), totalM: sig3(pred.totalM), hitLength: sig3(pred.hitLength), hitGrade: sig3(pred.hitGrade), hitFrom: sig3(pred.hitFrom),
    band: { md: pred.band.md.map((x) => sig(x, 6)), p10: pred.band.p10.map((x) => sig(x)), p50: pred.band.p50.map((x) => sig(x)), p90: pred.band.p90.map((x) => sig(x)) },
  };
}

// the state of a hole's prediction: none, current, moved (the hole changed since), or kept (the hole is drilled: never redone)
export function predictionState(hole) {
  const p = hole?.prediction;
  if (!p) return "none";
  if (hole.asDrilledHoleId) return "kept";
  return p.geometry === holeGeometryKey(hole) ? "current" : "moved";
}

// a number for the row: two significant figures, at most one decimal past the units for small values
export function fmt(x) {
  if (x == null || !Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a === 0) return "0";
  if (a >= 100) return String(Math.round(x));
  if (a >= 10) return String(Math.round(x * 10) / 10);
  return String(Number(x.toPrecision(2)));
}
