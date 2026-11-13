// TASKS.csv #3132 (split from #3078) — Downhole logs read every hole of the project; on the WA iron project (6,109 holes, 484,531 bins) a
// geologist asking about one block had to read the whole project. The readings can now be kept to the holes CHECKED in the 3D View (its hole
// list: viewerUiState.visibleHoles, a hole absent = checked) or to the holes whose collar lies inside an area (a closed boundary: a drawn
// area, a tenement, a prospect outline). Pure, no React.
import { pointInBoundary } from "./pointInPolygon.js";

// a boundary is an area when every part is closed (overlayExport's rule: no closedFlags = closed)
export const isAreaBoundary = (b) => (b?.polylines || []).length > 0 && (b.polylines || []).every((p, i) => (p || []).length >= 3 && (b.closedFlags || [])[i] !== false);
export const boundaryKey = (b, i) => `area:${b?.id ?? i}`;

// -> [{ key, kind: "all" | "checked" | "area", name? }] — the choices the pane offers (counts are worked out for the chosen one only)
export function logHoleChoices({ collars = [], boundaries = [], visibleHoles = null } = {}) {
  const out = [{ key: "all", kind: "all" }];
  if (collars.some((c) => visibleHoles?.[c.hole_id] === false)) out.push({ key: "checked", kind: "checked" });
  (boundaries || []).forEach((b, i) => { if (isAreaBoundary(b)) out.push({ key: boundaryKey(b, i), kind: "area", name: b.name || `Area ${i + 1}` }); });
  return out;
}

// the hole ids a choice keeps (String), or null for every hole
export function holesForChoice(key, { collars = [], boundaries = [], visibleHoles = null } = {}) {
  if (!key || key === "all") return null;
  if (key === "checked") return new Set(collars.filter((c) => visibleHoles?.[c.hole_id] !== false).map((c) => String(c.hole_id)));
  const i = (boundaries || []).findIndex((b, k) => boundaryKey(b, k) === key);
  if (i < 0) return null; // the area is gone: every hole, as before
  const polylines = boundaries[i].polylines;
  return new Set(collars.filter((c) => Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)) && pointInBoundary(Number(c.x), Number(c.y), polylines)).map((c) => String(c.hole_id)));
}

// sourceAssays' result kept to those holes (the same object without a filter) -> { ...data, assays, holeFilter: { holes, readings, of } }
export function filterLogData(data, holes) {
  if (!data || !holes) return data;
  const assays = data.assays.filter((r) => holes.has(String(r.hole_id)));
  const withReadings = new Set(assays.map((r) => String(r.hole_id)));
  return { ...data, assays, holeFilter: { holes: holes.size, holesWithReadings: withReadings.size, readings: assays.length, of: data.assays.length } };
}
