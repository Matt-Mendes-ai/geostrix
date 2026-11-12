// TASKS.csv #2829 — the Blake River gravity sample (sample_data/blake_river): the Geological Survey of Canada's compilation "Blake
// River, QC — 100 m" (gravity acquired 1974-2008, Open Government Licence - Canada), a sample with no drillholes. Matt, 2026-11-12:
// "approved, bundle the Blake River sample". The published Bouguer anomaly grid becomes a value raster that knows it is gravity in
// mGal (so reduction to the pole is refused on it and its derivatives carry a unit), and the 7,810 stations behind it become a
// gravity point survey, so gridding, the comparison with the published grid and the filters can all be tried offline. Nothing is
// synthesized (scripts/samples/build-blake-river.mjs only projects the stations' longitude / latitude). Each part is independent:
// one failing does not stop the other.
import { parseTableText } from "./tabular.js";
import { rowsToGeophysPoints } from "./geophysColumns.js";
import { replaceSurveyPoints } from "./geophysSurveys.js";
import { reprojectXY } from "./reproject.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

export const BLAKE_EPSG = 26917; // NAD83 / UTM zone 17N, the grid's own CRS
export const BLAKE_CRS_NAME = "NAD83 / UTM zone 17N";
export const BLAKE_GRID = "bouguer_100m.grd";
export const BLAKE_STATIONS = "stations.csv";
export const BLAKE_FILES = [BLAKE_GRID, BLAKE_STATIONS];
// project data, so English in every interface language
export const BLAKE_GRID_NAME = "Blake River Bouguer anomaly (GSC, 100 m)";
export const BLAKE_SURVEY = "Blake River gravity stations";

// the stations table -> the survey's points (Bouguer anomaly as the value, the station's elevation as z) and their median elevation
export function blakeStationPoints(text) {
  const { rows } = parseTableText(text);
  const points = rowsToGeophysPoints(rows, { x: "EASTING", y: "NORTHING", z: "ELEVATION", value: "BOUGUER", label: "STATION" })
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value))
    .map((r) => ({ ...r, _src: BLAKE_SURVEY }));
  const zs = points.map((r) => r.z).filter(Number.isFinite).sort((a, b) => a - b);
  return { points, medianZ: zs.length ? zs[Math.floor(zs.length / 2)] : 0 };
}

// readFile(name) -> File; store: { addRaster, setLayers, updateGeophysSurvey, setEpsg }; project: the open project ({ epsg, crsSet }).
// A project with no CRS chosen takes the sample's; one on another CRS gets the stations and the picture reprojected, and is told.
// -> notices
export async function loadBlakeRiver(readFile, { addRaster, setLayers, updateGeophysSurvey, setEpsg }, project = null) {
  const notes = [];
  const adopt = !project || project.crsSet === false || !project.epsg;
  const projectEpsg = adopt ? BLAKE_EPSG : Number(project.epsg);
  if (adopt) { setEpsg?.(BLAKE_EPSG); notes.push(notice("Project CRS set to {crs} (EPSG:{epsg}), the sample project's coordinate system.", { crs: BLAKE_CRS_NAME, epsg: BLAKE_EPSG })); }
  else if (projectEpsg !== BLAKE_EPSG) notes.push(notice("This project is EPSG:{epsg2}, not the sample's EPSG:{epsg} ({crs}): the stations and the grid's picture were reprojected into it, and the grid's values were not kept. Load the sample into a new project to work in its own coordinates.", { epsg: BLAKE_EPSG, crs: BLAKE_CRS_NAME, epsg2: projectEpsg }));
  let n = 0, medianZ = 0;
  try {
    const got = blakeStationPoints(await (await readFile(BLAKE_STATIONS)).text());
    if (projectEpsg !== BLAKE_EPSG) got.points = got.points.map((r) => { const q = reprojectXY(r.x, r.y, BLAKE_EPSG, projectEpsg); return q ? { ...r, x: q.x, y: q.y } : r; });
    n = got.points.length; medianZ = got.medianZ;
    setLayers((l) => ({ ...l, geophys_pts: replaceSurveyPoints(l.geophys_pts, got.points).rows })); // opening the sample twice replaces, does not double
    updateGeophysSurvey(BLAKE_SURVEY, { method: "grav", units: "mGal", zMeaning: "elevation" });
  } catch (e) { notes.push(errorNotice(tr("The Blake River stations could not be loaded: {message}", { message: e.message }))); }
  let size = "";
  try {
    const { buildRasterImport } = await import("./raster.js");
    // drawn at the stations' median elevation, so the grid and its stations sit together in the 3D view
    const { raster } = await buildRasterImport(await readFile(BLAKE_GRID), { epsg: projectEpsg, sourceEpsg: BLAKE_EPSG, defaultElevation: Math.round(medianZ), name: BLAKE_GRID_NAME });
    addRaster({ ...raster, surveyMethod: "grav", units: "mGal", drapeMode: "flat", provenance: { tool: "Bundled sample", source: "Geological Survey of Canada, compilation Blake River, QC — 100 m" } });
    const g = raster.grid;
    if (g?.sourceSize) size = `${g.sourceSize[0]} × ${g.sourceSize[1]}`;
  } catch (e) { notes.push(errorNotice(tr("The Blake River grid could not be loaded: {message}", { message: e.message }))); }
  notes.unshift(notice("Loaded the Blake River gravity sample (Geological Survey of Canada, Abitibi, Quebec; no drillholes): the published Bouguer anomaly grid ({size} nodes at 100 m, mGal) and {n} gravity stations. Open Maps for the grid, its contours and filters, or Geophysics > Point survey to grid the stations yourself and compare. See sample_data/blake_river/README.md for the source and the licence.", { size: size || "767 × 424", n: n.toLocaleString() }));
  return notes;
}
