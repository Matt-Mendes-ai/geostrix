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
  const polylines = [], closedFlags = [];
  for (const f of parsed.features || []) {
    const parts = f.parts?.length ? f.parts : [f.geometry];
    for (const part of parts) {
      if (!part || part.length < 2) continue;
      polylines.push(part.map(([x, y]) => { if (!T) return { x, y }; const [px, py] = T(x, y); return { x: px, y: py }; }));
      closedFlags.push(closed);
    }
  }
  return { polylines, closedFlags, sourceEpsg: src, note };
}
