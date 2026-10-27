// TASKS.csv #615 — any code path can ask the user to choose the project CRS (App renders ProjectCrsModal): the status
// bar, an online terrain / imagery fetch, a collar import into a project whose CRS was never chosen. Resolves with
// the chosen EPSG code (already set on the project), or null for "Decide later" / closed.
import { t as tr } from "./i18n.js";
const EVENT = "geostrix-request-project-crs";

// points: [{ x, y }] about to be imported (not yet in the store), for the "your collars would be at …" check
export function requestProjectCrs(reason = "", points = null) {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent(EVENT, { detail: { reason, points, resolve } })));
}

export function onProjectCrsRequest(handler) {
  const on = (e) => handler(e.detail);
  window.addEventListener(EVENT, on);
  return () => window.removeEventListener(EVENT, on);
}

// The CRS to use for something that only makes sense in the RIGHT place on Earth (fetching terrain or imagery):
// asks first when the project's CRS was never chosen. null = the user put it off.
export async function ensureProjectCrs(project, reason) {
  if (project?.crsSet) return Number(project.epsg);
  return requestProjectCrs(reason);
}

// TASKS.csv #1021 (review #1016: QGIS / GIS, geophysicist, exploration geologist, UX) — an export that puts the data on
// Earth (a .prj, a GeoTIFF's CRS, latitude / longitude for a GPS, an EPSG stamp) used the placeholder EPSG:3156 when the
// project's coordinate system was never chosen: Woodjam collars landed 409 km off. Asks first, like a terrain fetch.
// Resolves with the EPSG code to write, or null (the user put it off: the export is not made).
export async function ensureExportCrs(project) {
  if (project?.crsSet && project?.epsg) return Number(project.epsg);
  if (project?.crsSet !== false && project?.epsg) return Number(project.epsg); // a project from before #615 counts as chosen
  return requestProjectCrs(tr("This export places your data on Earth (latitude / longitude, a .prj, a GeoTIFF's coordinate system), but the project's coordinate system was never chosen — only a placeholder is set, and the file would put your data in the wrong place. Choose it first."));
}
