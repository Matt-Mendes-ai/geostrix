// TASKS.csv #1035 (review #1016, QGIS / GIS) — a shapefile or GeoPackage imported as a boundary or claim: every part of
// every feature (outer rings, holes, the other parts of a multi-part claim), reprojected from the file's own CRS (.prj
// or GeoPackage srs_id) to the project CRS. Before, only each feature's first ring was kept and the coordinates were
// assumed to be in the project CRS: a BC Albers (EPSG:3005) tenure shapefile landed 5,036 km away with 77 of 131 rings.
import { getProj4Def, guessEpsgFromPrjWkt, pointTransform } from "./reproject.js";

// parsed: { features: [{ geometry, parts? }], geomType, epsg?, prjWkt? } (parseShapefileZip / a parseGeoPackage layer)
// -> { polylines: [[{x, y}]], closedFlags, sourceEpsg, note } — note says what was done with the CRS, in English
export async function vectorToBoundaryPolylines(parsed, projectEpsg) {
  const dst = Number(projectEpsg) || null;
  const src = Number(parsed.epsg) || (parsed.prjWkt ? guessEpsgFromPrjWkt(parsed.prjWkt) : null) || null;
  let T = null, note;
  if (src && dst && src !== dst) {
    await Promise.all([getProj4Def(src), getProj4Def(dst)]); // registry codes load on demand (#834)
    T = pointTransform(src, dst);
    note = T ? `reprojected from EPSG:${src} to EPSG:${dst}` : `its CRS (EPSG:${src}) could not be converted: the coordinates were taken as EPSG:${dst}, check where it lies`;
  } else if (src) note = null; // already the project CRS
  else note = parsed.prjWkt ? `its .prj names a CRS GeoStrix does not recognize: the coordinates were taken as EPSG:${dst}, check where it lies`
    : `it states no CRS: the coordinates were taken as EPSG:${dst}, check where it lies`;
  const closed = parsed.geomType === "polygon";
  const polylines = [], closedFlags = [], featureOf = []; // featureOf: TASKS.csv #1970 — the feature each polyline came from
  (parsed.features || []).forEach((f, fi) => {
    const parts = f.parts?.length ? f.parts : [f.geometry];
    for (const part of parts) {
      if (!part || part.length < 2) continue;
      featureOf.push(fi);
      polylines.push(part.map(([x, y]) => { if (!T) return { x, y }; const [px, py] = T(x, y); return { x: px, y: py }; }));
      closedFlags.push(closed);
    }
  });
  return { polylines, closedFlags, featureOf, attributes: (parsed.features || []).map((f) => f.attributes || {}), sourceEpsg: src, note };
}

// TASKS.csv #1970 — a tenure file (BC Mineral Titles Online, a GeoPackage of claims) holds one feature per claim: each becomes
// its own claim, its tenure number, name and good-to date read from the attributes when a column says what it is. Up to `max`
// claims; a bigger file (a whole province) stays one claim and the caller says so. -> [{ name, polylines, closedFlags,
// tenureNumber, expiryDate }] or null when the file has one feature, no feature ids, or more than `max`.
const TENURE_COL = /^(tenure|title)(_?(number|num|no|nbr))?(_?id)?$|^(tenure|title|claim)_?(number|num|no|nbr)(_?id)?$/i;
const NAME_COL = /^(claim|tenure|title)_?name$|^name$/i;
const EXPIRY_COL = /good_?to|expir/i;
export function attrColumn(cols, rx) { return cols.find((c) => rx.test(String(c).trim())) || null; }
export function isoDateOf(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const t = String(v).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(t); // a dBASE date
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}
export function claimsFromVector(result, baseName, max = 300) {
  const { polylines = [], closedFlags = [], featureOf, attributes = [] } = result || {};
  if (!featureOf || featureOf.length !== polylines.length) return null;
  const used = [...new Set(featureOf)];
  if (used.length < 2 || used.length > max) return null;
  const cols = [...new Set(attributes.flatMap((a) => Object.keys(a || {})))];
  const tenureCol = attrColumn(cols, TENURE_COL), nameCol = attrColumn(cols, NAME_COL), expiryCol = attrColumn(cols, EXPIRY_COL);
  return used.map((fi, n) => {
    const at = attributes[fi] || {};
    const idx = featureOf.map((f, i) => (f === fi ? i : -1)).filter((i) => i >= 0);
    const tenure = tenureCol && at[tenureCol] != null ? String(at[tenureCol]).trim() : "";
    const label = (nameCol && at[nameCol] != null && String(at[nameCol]).trim()) || tenure || String(n + 1);
    return { name: `${baseName} ${label}`, polylines: idx.map((i) => polylines[i]), closedFlags: idx.map((i) => closedFlags[i]), tenureNumber: tenure, expiryDate: expiryCol ? isoDateOf(at[expiryCol]) : "" };
  });
}
