// TASKS.csv #615 — any code path can ask the user to choose the project CRS (App renders ProjectCrsModal): the status
// bar, an online terrain / imagery fetch, a collar import into a project whose CRS was never chosen. Resolves with
// the chosen EPSG code (already set on the project), or null for "Decide later" / closed.
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
