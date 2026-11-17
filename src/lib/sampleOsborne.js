// TASKS.csv #2006 — the Osborne mine airborne magnetics sample (sample_data/osborne): Geoscience Australia's survey P1029 as processed and published by Leonardo Uieda for the
// Fatiando a Terra documentation (CC BY 4.0), a sample with no drillholes: the flight-line readings as a magnetic point survey and the Lightning Creek anomaly grid (50 m) as a value
// raster that knows it is magnetic (nT). Same shape as the Blake River gravity sample, loaded by sampleBlakeRiver.js loadPointGrid; nothing is synthesized
// (scripts/samples/build-osborne-magnetic.mjs projects the readings and keeps every 40th of each flight line, and unpacks the grid).
import { parseTableText } from "./tabular.js";
import { rowsToGeophysPoints } from "./geophysColumns.js";
import { loadPointGrid } from "./sampleBlakeRiver.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

export const OSBORNE_EPSG = 32754; // WGS 84 / UTM zone 54 south, the grid's own CRS
export const OSBORNE_CRS_NAME = "WGS 84 / UTM zone 54S";
export const OSBORNE_GRID = "lightning_creek_magnetic_grid.tif";
export const OSBORNE_READINGS = "osborne_magnetic.csv";
export const OSBORNE_FILES = [OSBORNE_GRID, OSBORNE_READINGS];
// project data, so English in every interface language
export const OSBORNE_GRID_NAME = "Lightning Creek total-field magnetic anomaly (50 m)";
export const OSBORNE_SURVEY = "Osborne airborne magnetic readings";

// the readings table -> the survey's points (the anomaly as the value, the flight's height as z) and their median height
export function osborneReadingPoints(text) {
  const { rows } = parseTableText(text);
  const points = rowsToGeophysPoints(rows, { x: "easting", y: "northing", z: "height_m", value: "anomaly_nt", label: "flight_line" })
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value))
    .map((r) => ({ ...r, _src: OSBORNE_SURVEY }));
  const zs = points.map((r) => r.z).filter(Number.isFinite).sort((a, b) => a - b);
  return { points, medianZ: zs.length ? zs[Math.floor(zs.length / 2)] : 0 };
}

export const OSBORNE = {
  epsg: OSBORNE_EPSG, crsName: OSBORNE_CRS_NAME, stations: OSBORNE_READINGS, grid: OSBORNE_GRID, gridName: OSBORNE_GRID_NAME, surveyName: OSBORNE_SURVEY, points: osborneReadingPoints,
  survey: { method: "mag", units: "nT", zMeaning: "elevation" }, raster: { surveyMethod: "mag", units: "nT" },
  source: "Geoscience Australia, survey P1029 (MIM Data from Mt Isa Inlier, QLD), processed by Leonardo Uieda (Fatiando a Terra Data, CC BY 4.0)",
  msgs: {
    reprojected: (epsg2) => notice("This project is EPSG:{epsg2}, not the sample's EPSG:{epsg} ({crs}): the readings and the grid's picture were reprojected into it, and the grid's values were not kept. Load the sample into a new project to work in its own coordinates.", { epsg: OSBORNE_EPSG, crs: OSBORNE_CRS_NAME, epsg2 }),
    pointsFailed: (e) => errorNotice(tr("The Osborne magnetic readings could not be loaded: {message}", { message: e.message })),
    gridFailed: (e) => errorNotice(tr("The Lightning Creek grid could not be loaded: {message}", { message: e.message })),
    loaded: (size, n) => notice("Loaded the Osborne magnetics sample (Geoscience Australia survey P1029, Mt Isa Inlier, Queensland; no drillholes): the Lightning Creek anomaly grid ({size} nodes at 50 m, nT) and {n} flight-line readings (one in 40). Open Maps for the grid, its derivatives and filters, or Geophysics > Point survey to grid the readings yourself and compare. Contains data (c) Commonwealth of Australia (Geoscience Australia), processed by Leonardo Uieda (CC BY 4.0); see sample_data/osborne/README.md for the credit and the licence.", { size: size || "346 × 370", n: n.toLocaleString() }),
  },
};
export const loadOsborne = (readFile, store, project = null) => loadPointGrid(OSBORNE, readFile, store, project);
