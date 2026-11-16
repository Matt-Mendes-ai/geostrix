// TASKS.csv #3803 (Scottie Gold review) — the Inversion pane's checks of a chosen survey, in one pure function so they can run in a worker
// (surveyChecks.worker.js) and be kept per survey (surveyChecksClient.js): choosing a 213,270-point IP cloud froze the window about 9 s while the
// station spacing, the core-cell hint, the below-the-ground share and the thinning suggestion were worked out on the main thread, every time the
// choice changed. Each is the same function the pane called before (now on a grid, lib/nearestGrid.js); only where it runs has changed.
import { medianNearestSpacing, suggestThinSpacing, terrainElevationAt, MAX_STATIONS } from "./inversion.js";
import { coreCellHint } from "./coreCellHint.js";
import { downholeLikeness } from "./downholeLikeness.js";

// the columns a request carries (typed arrays travel to the worker without a copy of 250,000 objects)
// rows: [{ x, y, z, line }] -> { xs, ys, zs, lines }
export function packSurvey(rows) {
  const n = rows.length, xs = new Float64Array(n), ys = new Float64Array(n), zs = new Float64Array(n);
  let lines = null;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    xs[i] = r.x; ys[i] = r.y; zs[i] = Number.isFinite(r.z) ? r.z : NaN;
    if (r.line != null) { if (!lines) lines = new Array(n).fill(null); lines[i] = String(r.line); }
  }
  return { xs, ys, zs, lines };
}
// only what terrainElevationAt reads
export const slimTerrain = (t) => (t ? { bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask ?? null } : null);
const slimCollars = (cs) => (cs || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z)).map((c) => ({ x: c.x, y: c.y, z: c.z }));

// { xs, ys, zs, lines } + terrain + collars -> { spacing, coreHint, downhole, thinSuggestion }
export function surveyChecks({ xs, ys, zs, lines }, terrain = null, collars = []) {
  const n = xs.length;
  const rows = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = { x: xs[i], y: ys[i], z: zs[i], ...(lines && lines[i] != null ? { line: lines[i] } : {}) };
  const spacing = n > 1 ? medianNearestSpacing(xs, ys) : null;
  return {
    spacing,
    coreHint: coreCellHint(rows, spacing),
    downhole: downholeLikeness(rows, collars, terrain ? (x, y) => terrainElevationAt(terrain, x, y) : null),
    thinSuggestion: n > MAX_STATIONS ? suggestThinSpacing(xs, ys) : null,
  };
}
export const surveyChecksInput = (rows, terrain, collars) => ({ packed: packSurvey(rows), terrain: slimTerrain(terrain), collars: slimCollars(collars) });
