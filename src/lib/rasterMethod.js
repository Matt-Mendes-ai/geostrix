// TASKS.csv #2557 (review #2486, WA lithium) — a gridded survey forgot what it was: RTP ran without a word on a radiometric total-count grid
// (cps became -212 to 697), every potential-field filter was offered on every raster, and the ternary's K / eTh / eU lists held all 15
// rasters (magnetics, RTP, tilt, gravity...). The raster now keeps its survey's method (SURVEY_METHODS key) and unit; the filter list and
// the ternary follow it. A raster whose method is not known (an imported GeoTIFF) is treated as before. Pure.
import { SURVEY_METHODS } from "./geophysSurveys.js";

// the method of a raster: the one it carries, else its source survey's (rasters gridded before this kept only provenance.survey)
export function rasterMethodOf(raster, surveys) {
  const m = raster?.surveyMethod || surveys?.[raster?.provenance?.survey]?.method || null;
  return m && SURVEY_METHODS[m] ? m : null;
}
export const methodGroup = (method) => SURVEY_METHODS[method]?.group || null;

const NEEDS_FIELD = new Set(["rtp", "rtpa", "rte"]);
// why a grid filter does not apply to a raster of this method: "potential" (the filters assume a magnetic or gravity field: radiometrics,
// EM, depths...), "magnetic" (a reduction to the pole or equator on gravity), or null
export function filterBlockedBy(kind, method) {
  const g = methodGroup(method);
  if (!g) return null;
  if (g !== "mag" && g !== "grav") return "potential";
  if (g === "grav" && NEEDS_FIELD.has(kind)) return "magnetic";
  return null;
}

// the ternary's choices for one channel ("k" | "th" | "u"): that channel's grids first, then other radiometric grids, then the rest
const CHANNEL = { k: "rad_k", th: "rad_th", u: "rad_u" };
const NAME_RE = { k: /(^|[^a-z])(k|potassium)([^a-z]|$)/i, th: /(^|[^a-z])(e?th|thorium)([^a-z]|$)/i, u: /(^|[^a-z])(e?u|uranium)([^a-z]|$)/i };
export function ternaryChoices(rasters, channel, methodOf) {
  const rank = (r) => {
    const m = methodOf(r);
    if (m === CHANNEL[channel]) return 0;
    if (!m && NAME_RE[channel].test(r.name || "")) return 1;
    if (methodGroup(m) === "rad") return 2;
    return m ? 4 : 3; // a grid of another known method last
  };
  return rasters.map((r, i) => ({ r, i, k: rank(r) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => ({ raster: x.r, other: x.k === 4, exact: x.k === 0 })); // exact: #2559 — the ternary preselects it
}

// TASKS.csv #2559 — a survey key without its file extension, for a raster name: 'rad.csv · K_pct' -> 'rad · K_pct' (one import of a
// multi-channel file gives one survey per channel, and the three channel grids all came out named 'rad IDW 25 m')
export const surveyLabel = (key) => String(key ?? "").replace(/\.[A-Za-z0-9]{1,5}(?= · |$)/, "");

// points along one line (a single traverse): the spread across the main direction is under a cell. A grid of them is one row of cells
// that the 2D filters treat as a map; plot the line as a profile instead.
export function pointsAlongOneLine(points, cellM) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (P.length < 3) return true;
  let mx = 0, my = 0;
  for (const p of P) { mx += p.x; my += p.y; }
  mx /= P.length; my /= P.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of P) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= P.length; syy /= P.length; sxy /= P.length;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, minor = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return 4 * Math.sqrt(Math.max(0, minor)) < Number(cellM); // +-2 standard deviations across the line within one cell
}
