// TASKS.csv #3479 (from #3473; the WA iron review) — the Spectral index dialog opened on 'Clay / hydroxyl' on an iron-ore project, with 'Ferric iron' first
// in its list. The project carries no commodity field, so the commodity is read from what is loaded: when the assays hold iron (Fe) and half the holes
// with an Fe value have an Fe interval of 30 % or more, it is an iron project and the ferric-iron index is the default; a copper / gold porphyry
// (Cu or Au, no iron-ore Fe) gets clay / hydroxyl, as before. -> a Sentinel-2 preset id. Pure.
export function defaultSpectralIndex(assays, elements) {
  const fe = (elements || []).find((e) => /^fe(2o3|o|_?pct)?$/i.test(String(e.symbol)));
  if (!fe) return "s2_clay";
  const best = new Map();
  for (const a of assays || []) {
    const v = Number(a?.values?.[fe.symbol]);
    if (!Number.isFinite(v) || a.hole_id == null) continue;
    if (!(best.get(a.hole_id) >= v)) best.set(a.hole_id, v);
  }
  if (best.size < 3) return "s2_clay";
  const pct = /ppm|g\/t/i.test(fe.unit || "") ? 1e4 : 1; // ppm of Fe -> %
  let high = 0;
  for (const v of best.values()) if (v / pct >= 30) high++;
  return high >= best.size / 2 ? "s2_ferric" : "s2_clay";
}
