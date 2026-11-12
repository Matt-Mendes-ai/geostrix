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
// TASKS.csv #1858 (review #1646, Kodiak) — what a raster's values are in: the unit the user typed or its survey kept (raster.unit), else a
// geochemistry grid's element unit, else a terrain derivative's ("" when nothing says)
export const rasterUnitOf = (r) => String(r?.unit || r?.geochem?.unit || r?.units /* a gridded survey's unit (#2557), #2639 */ || r?.terrainDerivative?.unit || "").trim();

// TASKS.csv #2835 / #2842 (GSC geophysics review) — an IMPORTED grid (a .grd, GeoTIFF, GXF) had no method and nowhere to state one, so RTP
// ran on an EM conductance, a TEM decay constant, an eU and a Bouguer grid without a word. The raster card now has 'This grid is' (the
// method list above, stored as raster.surveyMethod, so the rules below apply); this guess, from the name and the typed unit, is OFFERED
// there, never set by itself. -> a SURVEY_METHODS key or null
const GUESS = [
  [/(^|[^a-z])(bouguer|bou|cba|grav|gravity|freeair|faa)([^a-z]|$)/i, "grav"],
  [/(^|[^a-z])(tau|taux?\d*)([^a-z]|$)|decay/i, "em_tau"],
  [/(^|[^a-z])(cond|conductance|conductivity|sigma)([^a-z]|$)/i, "em_cond"],
  [/(^|[^a-z])(eu|ura|uran|uranium)([^a-z]|$)/i, "rad_u"],
  [/(^|[^a-z])(eth|thor|thorium)([^a-z]|$)/i, "rad_th"],
  [/(^|[^a-z])(potassium|k_pct|kpct)([^a-z]|$)/i, "rad_k"],
  [/(^|[^a-z])(tc|totcount|total_count|dose)([^a-z]|$)/i, "rad_tc"],
  [/(^|[^a-z])(mag|mags|magnetic|magnetics|tmi|rmi|tfi|igrf)([^a-z]|$)/i, "mag"], // before res: "mag_res" is a residual magnetic grid (#2862)
  [/(^|[^a-z])(chg|charg|chargeability|ip)([^a-z]|$)/i, "ip"],
  [/(^|[^a-z])(res|resist|resistivity|rho)([^a-z]|$)/i, "res"],
];
const UNIT_GUESS = { mgal: "grav", "µgal": "grav", ugal: "grav", nt: "mag", cps: "rad_tc", "mv/v": "ip", ms: "em_tau", "ms/m": "em_cond", s: "em_cond" };
export function guessRasterMethod(raster) {
  const u = String(rasterUnitOf(raster)).trim().toLowerCase();
  if (UNIT_GUESS[u]) return UNIT_GUESS[u];
  const name = String(raster?.name ?? "").replace(/\.[a-z0-9]{2,5}$/i, "");
  for (const [re, m] of GUESS) if (re.test(name)) return m;
  return null;
}
// the filters that assume a magnetic or gravity field; on a grid of unknown method they wait for the method or a tick (#2835)
export const fieldFilterNeedsMethod = (kind) => kind !== "upward" && kind !== "spectrum";

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
