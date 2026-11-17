// TASKS.csv #3730 (Scottie Gold review) — a stretch of a hole with no survey station, in a survey that otherwise has one every few metres. SR23-299 had a station at 0 m,
// the next at 339 m, then one every 3 m: the trace was drawn through the 339 m as measured and nothing reported it. A gap is flagged when it is over MIN_GAP_M and over
// GAP_FACTOR times the usual spacing: the hole's own median spacing when it has enough stations to say, else the project's (the median of the holes' medians).
// A survey that stops short of the hole's end is the 'ends at' warning's job (dataQC.js); only gaps between two stations are looked at here.
import { median } from "./arrayStats.js";
export const MIN_GAP_M = 50, GAP_FACTOR = 5, OWN_MEDIAN_MIN_STATIONS = 5;

// the spacings between a hole's stations at distinct depths (stations sorted by depth)
function spacings(sorted) {
  const out = [];
  for (let i = 1; i < sorted.length; i++) { const d = sorted[i].depth - sorted[i - 1].depth; if (d > 0) out.push(d); }
  return out;
}
// byHole: Map hole id -> its stations (any order). The finder takes one hole's stations sorted by depth with finite depths. -> (sorted) => { gaps: [{ from, to }], widest: { from, to } } | null
export function surveyGapFinder(byHole) {
  let project = null; // the project's usual spacing, worked out only when a hole has a candidate gap
  const projectSpacing = () => {
    if (project == null) {
      const meds = [];
      for (const st of byHole.values()) { if (st.length >= OWN_MEDIAN_MIN_STATIONS) { const m = median(spacings([...st].filter((x) => Number.isFinite(x.depth)).sort((x, y) => x.depth - y.depth))); if (Number.isFinite(m)) meds.push(m); } }
      project = meds.length ? median(meds) : NaN;
    }
    return project;
  };
  return (sorted) => {
    let candidates = null;
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i].depth - sorted[i - 1].depth;
      if (g > MIN_GAP_M) (candidates || (candidates = [])).push({ from: sorted[i - 1].depth, to: sorted[i].depth, g });
    }
    if (!candidates) return null;
    const own = sorted.length >= OWN_MEDIAN_MIN_STATIONS ? median(spacings(sorted)) : NaN;
    const usual = Number.isFinite(own) ? own : projectSpacing();
    if (!Number.isFinite(usual)) return null;
    const gaps = candidates.filter((c) => c.g > GAP_FACTOR * usual);
    if (!gaps.length) return null;
    return { gaps, widest: gaps.reduce((a, b) => (b.g > a.g ? b : a)), usual };
  };
}

// TASKS.csv #3756 (1) — the same check for the survey import's own notice (Data QC runs only when opened): rows are the imported stations ({ hole_id, depth }); the holes with a gap and the
// widest one. -> { holes: n, widest: { hole_id, from, to } } | null
export function surveyGapsOfRows(rows) {
  const byHole = new Map();
  for (const r of rows || []) { const d = Number(r?.depth); if (!Number.isFinite(d)) continue; (byHole.get(r.hole_id) || byHole.set(r.hole_id, []).get(r.hole_id)).push({ depth: d }); }
  const find = surveyGapFinder(byHole);
  let holes = 0, widest = null;
  for (const [hole_id, st] of byHole) {
    const g = find(st.sort((a, b) => a.depth - b.depth));
    if (!g) continue;
    holes++;
    if (!widest || g.widest.to - g.widest.from > widest.to - widest.from) widest = { hole_id, from: g.widest.from, to: g.widest.to };
  }
  return holes ? { holes, widest } : null;
}

