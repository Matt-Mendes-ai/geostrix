// TASKS.csv #4052 (Matt, Macpass in plan: "quartz from aster doesn't look right") — which ASTER L1T scene to offer first. The archive is 2000-2006 with no season or day / night filter: the scene
// that covered most of the area could be a winter night, where the surface is cold, snow-covered and uniform in the thermal infrared and an index of a few per cent shows only stripes and
// noise. A scene is described by its month in the project's hemisphere (snow-free months, as lastSummer does for Sentinel-2, #2464) and whether it was a daytime pass, and the list is
// ranked: coverage of the area first, then clear season and daytime, then cloud. Pure.

import { currentLanguage, NUMBER_LOCALES } from "./i18n.js";

// the months of the clear (snow-free, or dry in the tropics) season of the project's hemisphere: 1-12. Unknown latitude counts as north.
export function clearMonths(lat = null) {
  if (Number.isFinite(lat) && Math.abs(lat) < 23.5) return lat < 0 ? [6, 7, 8, 9] : [12, 1, 2, 3]; // the dry season (#3000 / #3473)
  if (Number.isFinite(lat) && lat < 0) return [12, 1, 2];
  return [7, 8, 9];
}

// the mean local solar hour (0-24) of an ISO timestamp (UTC) at a longitude: UTC + lon / 15
export function solarHour(iso, lon) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  const utc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return ((utc + (Number.isFinite(lon) ? lon / 15 : 0)) % 24 + 24) % 24;
}
// ASTER crosses the equator at about 10:30 local solar time by day and 22:30 by night: a pass between 8 and 16 is a daytime one
export const isDaytime = (iso, lon) => { const h = solarHour(iso, lon); return Number.isFinite(h) && h >= 8 && h < 16; };

// a scene { date, datetime?, sunElevation?, coverage, cloud } over an area centred at (lat, lon) -> the same with { month, day, inSeason, solarHour }. Daytime is the catalogue's own sun
// elevation (above 10 degrees) when it gives one, else the local solar hour of the pass.
export function describeScene(scene, lat, lon) {
  const iso = scene.datetime || `${scene.date}T00:00:00Z`;
  const month = Number(String(scene.date).slice(5, 7));
  const hour = scene.datetime ? solarHour(iso, lon) : NaN;
  const day = Number.isFinite(scene.sunElevation) ? scene.sunElevation > 10 : scene.datetime ? isDaytime(iso, lon) : null;
  return { ...scene, month, solarHour: hour, day, inSeason: clearMonths(lat).includes(month) };
}

// coverage in steps of 5 % first (a scene that covers 97 % is not better than one that covers 95 %: it is the same), then a clear-season daytime scene, then either, then one under the
// cloud limit, then fewer clouds, then the later date
export function rankAsterScenes(scenes, { maxCloud = 100 } = {}) {
  const tier = (s) => Math.round((s.coverage ?? 0) * 20) / 20;
  const good = (s) => (s.inSeason ? 2 : 0) + (s.day === true ? 1 : s.day === null ? 0.5 : 0);
  const clear = (s) => ((s.cloud ?? 100) <= maxCloud ? 1 : 0);
  return [...scenes].sort((a, b) => tier(b) - tier(a) || good(b) - good(a) || clear(b) - clear(a) || (a.cloud ?? 100) - (b.cloud ?? 100) || String(b.date).localeCompare(String(a.date)));
}

// what the ranked list's first scene does not give: the share of the area it covers (under 98 %), its month when that is outside the clear months, a night pass
export function searchAdvice(ranked) {
  const first = ranked?.[0];
  if (!first) return null;
  return { coverage: (first.coverage ?? 1) < 0.98 ? Math.round(100 * (first.coverage ?? 0)) : null, offSeasonMonth: first.inSeason ? null : first.month, night: first.day === false };
}

// The scan lines of an L1T scene run along the footprint's cross-track edges. ring: the footprint's outline in the grid's CRS ([E, N]; the catalogue's has hundreds of points, jagged
// along the edges), reduced here to its four corners (the northmost, eastmost, southmost and westmost points of a tilted square) and the edges between them. -> the angle, in degrees from
// the grid's rows (-45 to 45, the convention of lib/tirDestripe.js: 0 = the rows, a line tilting down to the right in a north-up picture is negative), the length-weighted mean of the two
// edges within 45 degrees of the rows; null when none is. Macpass 2001-05-20: the footprint gives -19.4, the data -19.5.
export function crossTrackAngle(ring) {
  if (!ring || ring.length < 3) return null;
  const pick = (better) => ring.reduce((a, p) => (better(p, a) ? p : a), ring[0]);
  const corners = [pick((p, a) => p[1] > a[1]), pick((p, a) => p[0] > a[0]), pick((p, a) => p[1] < a[1]), pick((p, a) => p[0] < a[0])];
  let sum = 0, len = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (!(l > 0)) continue;
    let phi = (Math.atan2(-dy, dx) * 180) / Math.PI; // the edge's angle in picture coordinates (y down)
    if (phi > 90) phi -= 180; else if (phi <= -90) phi += 180;
    if (Math.abs(phi) <= 45) { sum += -phi * l; len += l; }
  }
  return len ? Math.round((sum / len) * 10) / 10 : null;
}

// the month's name in the interface language ("July", "juillet"): the words are the browser's own, not a list of ours
export const monthName = (m) => (m >= 1 && m <= 12 ? new Date(2000, m - 1, 15).toLocaleDateString(NUMBER_LOCALES[currentLanguage()] || "en", { month: "long" }) : "");
