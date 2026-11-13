// TASKS.csv #3063 (the rest of #2934, WA iron review) — a project far wider than its holes are deep (WA iron: 21.6 x 17.4 km of 50-90 m holes)
// shows each hole about a pixel long at Fit: no log or grade can be seen until the view is exaggerated, and the exaggeration is a control the
// user has to know about. When the collars' plan extent is over SUGGEST_RATIO times the holes' depth range, a VE is suggested once: the
// largest of the view's choices up to a tenth of the ratio (at least 2x). Suspect collar elevations (#3004) are left out of the range.
import { VE_CHOICES } from "../../modules/viewer/verticalExaggeration.js";
import { mainTraces } from "./levelPlanRange.js";

export const SUGGEST_RATIO = 50;

// traces: [{ wx, wy, wz }] (world). -> { ratio, ve, extentM, depthM } or null
export function veSuggestion(traces) {
  const ts = mainTraces((traces || []).filter((t) => t?.wz?.length), (t) => t.wz[0]);
  if (ts.length < 2) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const t of ts) {
    const x = t.wx[0], y = t.wy[0];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (const z of t.wz) { if (z < z0) z0 = z; if (z > z1) z1 = z; }
  }
  const extentM = Math.max(x1 - x0, y1 - y0), depthM = z1 - z0;
  if (!(extentM > 0) || !(depthM > 0)) return null;
  const ratio = extentM / depthM;
  if (ratio < SUGGEST_RATIO) return null;
  let ve = 2;
  for (const v of VE_CHOICES) if (v <= ratio / 10 && v > ve) ve = v;
  return { ratio, ve, extentM, depthM };
}
