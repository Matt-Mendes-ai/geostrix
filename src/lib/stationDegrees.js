// TASKS.csv #2832 (GSC geophysics review B2) — Blake River's 7,810 gravity stations (X / Y in decimal degrees, Geosoft columns named X and Y)
// went into a UTM project as metres: a 1.3 m pillar, no warning. Two guards for the point-survey import:
//   geosoftHeaderEpsg: the file's own Geosoft comment header ('/ Projection:"WGS 84"' with '/ Unit:dega', or '... / UTM zone 17N'),
//     read as #1329 reads a GEM header;
//   xyLookLikeDegrees: every X within +-180 and every Y within +-90, with decimals: in a projected project those are not metres.
// Pure.

// datum words -> the geographic EPSG and the UTM base (north)
const DATUMS = [
  { re: /WGS\s*-?\s*84/i, geo: 4326, utmN: 32600, utmS: 32700 },
  { re: /NAD\s*-?\s*83|North American Datum 1983/i, geo: 4269, utmN: 26900, utmS: null },
  { re: /NAD\s*-?\s*27|North American Datum 1927/i, geo: 4267, utmN: 26700, utmS: null },
  { re: /GDA\s*-?\s*94/i, geo: 4283, utmN: null, utmS: null },
];
// the first lines of a file -> an EPSG code when its Geosoft header names a CRS GeoStrix can tell, else null
export function geosoftHeaderEpsg(text) {
  let projection = null, degrees = false;
  for (const l of String(text || "").split(/\r\n|\r|\n/, 60)) {
    const t = l.trim();
    if (!t.startsWith("/")) continue;
    const p = /^\/\s*Projection\s*:\s*"?([^"]+?)"?\s*$/i.exec(t);
    if (p) projection = p[1];
    if (/^\/\s*Unit\s*:\s*"?dega\b/i.test(t)) degrees = true;
  }
  if (!projection) return null;
  const d = DATUMS.find((x) => x.re.test(projection));
  if (!d) return null;
  const z = /UTM\s*zone\s*(\d{1,2})\s*([NS])?/i.exec(projection);
  if (z) {
    const zone = Number(z[1]), south = /S/i.test(z[2] || "");
    if (zone < 1 || zone > 60) return null;
    const base = south ? d.utmS : d.utmN;
    return base ? base + zone : null;
  }
  // a datum alone is geographic: said by '/ Unit:dega', or the projection names nothing more than the datum
  return degrees || !/zone|lambert|albers|mercator|projection|grid/i.test(projection) ? d.geo : null;
}
// rows' X / Y columns all within +-180 / +-90 (finite values), at least `min` of them, some with decimals -> true
export function xyLookLikeDegrees(rows, xCol, yCol, { min = 3, sample = 5000 } = {}) {
  if (!xCol || !yCol) return false;
  let n = 0, frac = false;
  const step = Math.max(1, Math.floor((rows || []).length / sample));
  for (let i = 0; i < (rows || []).length; i += step) {
    const x = Number(rows[i]?.[xCol]), y = Number(rows[i]?.[yCol]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > 180 || Math.abs(y) > 90) return false;
    if (!Number.isInteger(x) || !Number.isInteger(y)) frac = true;
    n++;
  }
  return n >= min && frac;
}
