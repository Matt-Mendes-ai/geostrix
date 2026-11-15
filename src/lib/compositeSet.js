// TASKS.csv #3567 (Fireweed / Macpass rehearsal) — compositing took one element at a time: Zn, Pb and Ag were three runs and three CSV files with different row counts
// (20,858 / 20,851 / 20,252: the blanks differ by element), and no density was composited. One run here: the windows are the hole's (and domain's) own grid, the same for
// every element, so every composite carries each element's grade and its coverage in its own column, and the composite's density from the Specific gravity layer.
import { compositeDownhole } from "./geochem.js";

// symbols: the elements, the first the primary (its cap is the dialog's); opts: compositeDownhole's (opts.densityAt weights each grade by length x density), with capValue for the primary only;
// densityCol: densityLookup's function, for the density column.
// -> rows [{ hole_id, from, to, length, domain, conflictLength, avgGrade (primary), coverage (primary), values: { symbol: { grade, coverage } }, density, weighting }] sorted by hole and depth,
// one per window any of the elements kept; `stats` { perElement: { symbol: { readings, leftOut, underCovered } }, shortEndsMerged, shortEndsDropped }
export function compositeSet(assays, symbols, elementUnits, opts = {}, densityCol = null) {
  const rows = new Map(); // "hole|from|to" -> row
  const per = {};
  let merged = 0, dropped = 0;
  symbols.forEach((symbol, k) => {
    const st = {};
    const unit = elementUnits[symbol] || "ppm";
    const comps = compositeDownhole(assays, symbol, unit, elementUnits, { ...opts, capValue: k === 0 ? opts.capValue ?? null : null, capByDomain: k === 0 ? opts.capByDomain : null, stats: st });
    per[symbol] = { readings: st.readings || 0, leftOut: st.leftOut || 0, underCovered: st.underCovered || 0 };
    if (k === 0) { merged = st.shortEndsMerged || 0; dropped = st.shortEndsDropped || 0; }
    for (const c of comps) {
      const key = `${c.hole_id}|${c.from}|${c.to}`;
      let r = rows.get(key);
      if (!r) {
        r = { hole_id: c.hole_id, from: c.from, to: c.to, length: c.length, domain: c.domain, conflictLength: 0, avgGrade: null, coverage: null, values: {}, density: null, weighting: null };
        rows.set(key, r);
      }
      r.values[symbol] = { grade: c.avgGrade, coverage: c.coverage, weighting: c.weighting || null };
      r.conflictLength = Math.max(r.conflictLength, c.conflictLength || 0);
      if (k === 0) { r.avgGrade = c.avgGrade; r.coverage = c.coverage; r.weighting = c.weighting || null; }
    }
  });
  const out = [...rows.values()].sort((a, b) => (a.hole_id < b.hole_id ? -1 : a.hole_id > b.hole_id ? 1 : a.from - b.from));
  if (densityCol) for (const r of out) r.density = densityCol(r.hole_id, r.from, r.to); // the composite's own density: the layer's, whatever the assays cover
  out.stats = { perElement: per, shortEndsMerged: merged, shortEndsDropped: dropped };
  return out;
}

// the set as a numeric custom layer ('Keep in the project'): rows { hole_id, from, to, value (the primary's grade), <symbol>: grade, coverage_<symbol>, density }, so the 3D View colours by any
// field, and Estimation, Grade shell, Geochem X-Y and Statistics read it as a numeric layer. A window the primary element did not keep has no value and is left out of the layer.
export function compositeLayerRows(set, symbols) {
  const out = [];
  for (const r of set) {
    if (r.avgGrade == null) continue;
    const row = { hole_id: r.hole_id, from: r.from, to: r.to, value: r.avgGrade };
    for (const s of symbols) {
      const v = r.values[s];
      if (v) { row[s] = v.grade; row[`coverage_${s}`] = +(v.coverage * 100).toFixed(1); }
    }
    if (r.density != null) row.density = r.density;
    out.push(row);
  }
  return out;
}

// the CSV rows of the set: the primary's columns as the single-element export has them, then each other element and its coverage, the density and the weighting
export function compositeSetCsvRows(set, symbols, elementUnits, { base, sig6 }) {
  return set.map((r, i) => {
    const row = { ...base[i] };
    symbols.forEach((s, k) => {
      const v = r.values[s];
      if (k > 0) { row[`avg_${s}_${elementUnits[s] || "ppm"}`] = v ? sig6(v.grade) : ""; row[`coverage_${s}_pct`] = v ? (v.coverage * 100).toFixed(0) : ""; }
    });
    row.density_t_m3 = r.density == null ? "" : sig6(r.density);
    row.grade_weighting = r.weighting === "density" ? "length x density" : "length";
    return row;
  });
}
