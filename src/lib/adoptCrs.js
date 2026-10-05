// TASKS.csv #607 — the default project CRS is 3156 (NAD83(CSRS) UTM 9N, the Golden Triangle). Data from anywhere
// else, imported into an EMPTY project, used to be reprojected into zone 9 without a word (a UTM 10 property
// landed at ~1,020,000 E). When nothing is loaded yet and the file DECLARES a different CRS GeoStrix can use
// (.prj, GeoPackage, a srid column with one value), the user is asked whether to make it the project CRS.
// Returns the EPSG code to adopt, or null to keep the current one. `confirm` is injectable for tests.
import { crsName } from "./reproject.js";

export function shouldOfferCrs({ isEmpty, currentEpsg, declaredEpsg }) {
  const cur = Number(currentEpsg), d = Number(declaredEpsg);
  return !!isEmpty && Number.isInteger(d) && d > 0 && d !== cur && !!crsName(d);
}

export function askAdoptCrs({ isEmpty, currentEpsg, declaredEpsg, fileName }, confirm = (m) => window.confirm(m)) {
  if (!shouldOfferCrs({ isEmpty, currentEpsg, declaredEpsg })) return null;
  const cur = Number(currentEpsg), d = Number(declaredEpsg);
  const ok = confirm(
    `This project is empty and its CRS is ${crsName(cur) || "?"} (EPSG:${cur}).\n` +
    `${fileName} is in ${crsName(d)} (EPSG:${d}).\n\n` +
    `OK — use EPSG:${d} as the project CRS (the data keeps its own coordinates).\n` +
    `Cancel — keep EPSG:${cur} and reproject the data into it.`);
  return ok ? d : null;
}
