// TASKS.csv #2846 (GSC review B13, Blake River / Matagami) — a point survey could only be gridded by IDW (or equivalent sources): an IDW grid
// of the Blake River stations matched the published Bouguer grid (r 0.9992) but its first vertical derivative only r 0.67 against the
// published one (bull's-eyes at every station). Minimum curvature (the usual gridder for gravity and magnetic stations) and Verde's spline
// existed for Geochem's surface samples only: a survey's points go through the same gridder (lib/sampleGrid.js), nodes on multiples of the
// cell. Pure.
import { gridSamples, splineRequest, splineFinish } from "./sampleGrid.js";

const asSamples = (pts) => (pts || []).map((r) => ({ x: r.x, y: r.y, values: { v: r.value } }));
// blank: metres, Infinity (or 0) for no blanking
const optsOf = ({ cell, blank, method, tension = 0.25 }) => ({ cellM: cell, blankM: Number.isFinite(blank) && blank > 0 ? blank : 0, method, tension });
// "mincurv" -> the sampleGrid result ({ grid, bbox, valid, cellM, iterations, ... } or { error })
export const gridSurvey = (pts, o) => gridSamples(asSamples(pts), "v", optsOf(o));
// "spline" -> { plan, request } for the Python engine's pfields job, or { error }
export const surveySplineRequest = (pts, o) => splineRequest(asSamples(pts), "v", optsOf({ ...o, method: "spline" }));
export { splineFinish };
// the method's tag in a raster's name
export const gridMethodTag = (method, tension) => (method === "mincurv" ? `min. curvature T${tension}` : method === "spline" ? "spline" : "IDW");
