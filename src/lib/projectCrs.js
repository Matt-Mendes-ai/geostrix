// TASKS.csv #615 — choosing the project CRS, anywhere on Earth. Matt: "we gotta give the user an option to assign a
// CRS to their project. Remember this will be used across the globe". A new project used to be silently EPSG:3156
// (NAD83(CSRS) UTM 9N, the Golden Triangle), and a collar CSV carries no CRS, so zone 10 data sat in zone 9 and
// online terrain came from ~400 km away (#614). The project now records whether the user chose its CRS
// (project.crsSet); these helpers find the candidates for a place and show where collars would land.
import { listSupportedCrs, pointTransform, crsName } from "./reproject.js";

export const utmZoneOf = (lon) => Math.min(60, Math.max(1, Math.floor((((lon + 180) % 360) + 360) % 360 / 6) + 1));

// The datum family a geologist working at (lon, lat) most likely uses, listed first. Rough boxes are enough: the
// rest of the zone's CRSs are still offered underneath.
function preferredFamilies(lon, lat) {
  if (lat > 41 && lon > -142 && lon < -52) return ["NAD83(CSRS)", "NAD83", "WGS 84"]; // Canada
  if (lat > 14 && lon > -170 && lon < -52) return ["NAD83", "WGS 84"]; // USA, Mexico
  if (lat < 13 && lat > -56 && lon > -93 && lon < -30) return ["SIRGAS 2000", "SAD69", "WGS 84"]; // Central / South America
  if (lat < -9 && lat > -45 && lon > 108 && lon < 160) return ["GDA2020", "GDA94", "WGS 84"]; // Australia
  if (lat > 34 && lon > -25 && lon < 45) return ["ETRS89", "WGS 84"]; // Europe
  return ["WGS 84"];
}

// Supported projected CRSs for the UTM (or MGA) zone at (lon, lat), regional datum first. Each: { code, name, zone }.
export function crsCandidatesAt(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 84) return [];
  const zone = utmZoneOf(lon), hemi = lat >= 0 ? "N" : "S";
  const utm = new RegExp(`UTM zone ${zone}${hemi}\\b`), mga = new RegExp(`MGA zone ${zone}\\b`);
  const hits = listSupportedCrs().filter((c) => utm.test(c.name) || (hemi === "S" && mga.test(c.name)));
  const fams = preferredFamilies(lon, lat);
  const rank = (c) => { const i = fams.findIndex((f) => c.name.startsWith(f + " ")); return i < 0 ? fams.length : i; };
  const out = hits.map((c) => ({ ...c, zone })).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  // the national grids that are not UTM, where they apply
  if (lat > 48 && lat < 60.1 && lon > -139.1 && lon < -114) out.push({ code: 3005, name: crsName(3005), zone: null });
  if (lat < -33 && lat > -48 && lon > 165 && lon < 179) out.unshift({ code: 2193, name: crsName(2193), zone: null }); // NZTM is the NZ standard
  return out.filter((c) => c.name);
}

// Where the collars' centre would be on Earth if they were in `epsg`: { lon, lat } or null.
export function collarCentreLonLat(collars, epsg) {
  const pts = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
  if (!pts.length || !epsg) return null;
  const T = pointTransform(epsg, 4326);
  if (!T) return null;
  const xs = pts.map((c) => c.x).sort((a, b) => a - b), ys = pts.map((c) => c.y).sort((a, b) => a - b);
  const [lon, lat] = T(xs[xs.length >> 1], ys[ys.length >> 1]);
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180.0001 ? { lon, lat } : null;
}

export const formatLonLat = ({ lon, lat }) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;

// "52.2, -121.3", "52.2 N 121.3 W", "-23.5 -46.6" -> { lat, lon } (lat first, as people say it), or null.
export function parseLatLon(text) {
  const s = String(text || "").trim().toUpperCase();
  const m = /^(-?\d+(?:[.,]\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:[.,]\d+)?)\s*°?\s*([EW])?$/.exec(s);
  if (!m) return null;
  let lat = Number(m[1].replace(",", ".")), lon = Number(m[3].replace(",", "."));
  if (m[2] === "S") lat = -Math.abs(lat);
  if (m[4] === "W") lon = -Math.abs(lon);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
