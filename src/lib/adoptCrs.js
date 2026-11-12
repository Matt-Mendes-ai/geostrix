// medianLonLat (TASKS.csv #2833): the middle of points whose x / y are longitude / latitude, for askAdoptCrs's `at`; null when they are not degrees
export function medianLonLat(points) {
  const ok = (points || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90);
  if (!ok.length || ok.length < (points || []).length * 0.9) return null;
  const m = (k) => ok.map((p) => p[k]).sort((a, b) => a - b)[ok.length >> 1];
  return { lon: m("x"), lat: m("y") };
}
// TASKS.csv #607 — the default project CRS is 3156 (NAD83(CSRS) UTM 9N, the Golden Triangle). Data from anywhere
// else, imported into an EMPTY project, used to be reprojected into zone 9 without a word (a UTM 10 property
// landed at ~1,020,000 E). When nothing is loaded yet and the file DECLARES a different CRS GeoStrix can use
// (.prj, GeoPackage, a srid column with one value), the user is asked whether to make it the project CRS.
// Returns the EPSG code to adopt, or null to keep the current one. `confirm` is injectable for tests.
import { crsName, isGeographicCrs } from "./reproject.js";
import { crsCandidatesAt } from "./projectCrs.js";
import { t as tr } from "./i18n.js";

export function shouldOfferCrs({ isEmpty, currentEpsg, declaredEpsg }) {
  const cur = Number(currentEpsg), d = Number(declaredEpsg);
  return !!isEmpty && Number.isInteger(d) && d > 0 && d !== cur && !!crsName(d);
}

// TASKS.csv #1148 — at: { lon, lat } of the data, when it is known. A file in latitude / longitude must not become the project's
// CRS: x and y in degrees against elevations in metres draws terrain as spikes (Matt: public samples in Australia, then SRTM).
// With a place, the metric CRS for it is offered instead, and the data is reprojected into that.
// crsSet (TASKS.csv #2833): the project's CRS was chosen (store project.crsSet); then a file never offers to replace it. Callers that pass
// nothing keep the #607 behaviour. A geographic CRS with no `at` is never offered (#1148's rule, whatever the caller): before, a caller
// without `at` offered EPSG:4269 to an empty project and OK made it the project CRS (GSC review B3).
export function askAdoptCrs({ isEmpty, currentEpsg, declaredEpsg, fileName, at = null, crsSet = false }, confirm = (m) => window.confirm(m)) {
  if (crsSet || !shouldOfferCrs({ isEmpty, currentEpsg, declaredEpsg })) return null;
  const cur = Number(currentEpsg), d = Number(declaredEpsg);
  if (isGeographicCrs(d) && !at) return null; // #2833 — degrees never become the project CRS
  if (at && isGeographicCrs(d)) {
    const m = crsCandidatesAt(at.lon, at.lat)[0];
    if (!m || m.code === cur) return null;
    return confirm(tr("This project is empty and its CRS is {cur} (EPSG:{code}).\n{file} is in latitude and longitude, which cannot be a project CRS: elevations are in metres.\n\nOK: use {name} (EPSG:{m}) for this area and reproject the data into it.\nCancel: keep EPSG:{code}.", { cur: crsName(cur) || "?", code: cur, file: fileName, name: m.name, m: m.code })) ? m.code : null;
  }
  const ok = confirm(
    `This project is empty and its CRS is ${crsName(cur) || "?"} (EPSG:${cur}).\n` +
    `${fileName} is in ${crsName(d)} (EPSG:${d}).\n\n` +
    `OK — use EPSG:${d} as the project CRS (the data keeps its own coordinates).\n` +
    `Cancel — keep EPSG:${cur} and reproject the data into it.`);
  return ok ? d : null;
}

// For importers that settle the source CRS deep inside (raster.js buildRasterImport / parseDEMFiles): returns a
// (sourceEpsg, currentEpsg) => epsg function they call once the file's CRS is known.
// bbox (TASKS.csv #2678): the file's box in its own CRS. A geographic tag on numbers that are not degrees (a mis-tagged GeoTIFF in metres)
// is not offered at all: it would have made the whole project EPSG:4326. A box in degrees is offered the metric CRS of its place (#1148).
export function projectEpsgChooser({ isEmpty, setEpsg, fileName, notify }, confirm = undefined) {
  return (sourceEpsg, currentEpsg, bbox = null) => {
    let at = null;
    if (isGeographicCrs(Number(sourceEpsg)) && Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) {
      const [x0, y0, x1, y1] = bbox;
      if ([x0, x1].some((v) => Math.abs(v) > 180.5) || [y0, y1].some((v) => Math.abs(v) > 90.5)) return currentEpsg; // #2678 — not degrees
      at = { lon: (x0 + x1) / 2, lat: (y0 + y1) / 2 };
    }
    const d = askAdoptCrs({ isEmpty, currentEpsg, declaredEpsg: sourceEpsg, fileName, at }, ...(confirm ? [confirm] : []));
    if (!d) return currentEpsg;
    setEpsg(d);
    notify?.(`Project CRS set to ${crsName(d)} (EPSG:${d}) from ${fileName}.`);
    return d;
  };
}
