// TASKS.csv #4104 (Matt's screenshot, the Osborne magnetics sample) — the Inversion pane said "The terrain covers every station." while the plan's
// warning said "3 station(s) lie outside the terrain surface": the pane sampled ~2,000 of the 16,633 stations and called 99.95 % "every".
// Now one count: the plan's own (the sidecar's, the same as its warning) once an estimate has run, else every station counted here.

// rows: [{ x, y }]; elevationAt(x, y) -> a number, or not finite outside the terrain -> { outside, total, pct }
export function stationCoverage(rows, elevationAt) {
  let outside = 0, total = 0;
  for (const r of rows || []) { total++; if (!Number.isFinite(elevationAt(r.x, r.y))) outside++; }
  return total ? { outside, total, pct: (100 * (total - outside)) / total } : null;
}

// the count the pane says: the plan's when it carries one (an older sidecar does not), else the pane's own -> { outside, total } or null
export function coverageCount(coverage, plan) {
  if (plan && Number.isInteger(plan.stationsOutside) && Number.isInteger(plan.nData) && plan.nData > 0) return { outside: plan.stationsOutside, total: plan.nData };
  return coverage ? { outside: coverage.outside, total: coverage.total } : null;
}
