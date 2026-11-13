// TASKS.csv #3107 — the Mount Raymond sample (sample_data/mount_raymond): a surface-mapping project with no drillholes, from the
// Geological Survey of Canada's Canadian Geoscience Map 71, second edition (Bedrock geology, Mount Raymond, Yukon, NTS 116-I/8,
// 1:50 000; Open Government Licence - Canada). The map's own shapefiles become map layers draped on a terrain cut from the federal
// Canadian Digital Elevation Model, and its 119 planar measurements become outcrop measurements, so 3D Modelling > Model from map
// works offline on a folded and thrust-faulted sedimentary succession. Nothing is synthesized (scripts/samples/build-mount-raymond.mjs
// says what was done to the files). Each part is independent: one failing does not stop the others.
import Papa from "papaparse";
import { parseShapefileParts } from "./shapefile.js";
import { buildLayer, autoColorFor } from "./mapLayerBuild.js";
import { autoCategories, parseStructureRows } from "./mapLayers.js";
import { bearingsToGrid } from "./azimuthRef.js";
import { parseDEMFiles } from "./raster.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

export const RAYMOND_EPSG = 26908; // NAD83 / UTM zone 8N, the map's own grid
export const RAYMOND_CRS_NAME = "NAD83 / UTM zone 8N";
// base name, the attribute to colour by, shown at start, the layer's name in the project (project data: English in every language)
export const RAYMOND_LAYERS = [
  { base: "map_units", field: "MAP_UNIT", visible: true, name: "Map units (CGM 71)" },
  { base: "faults", field: "SUBFEATURE", visible: true, name: "Faults (CGM 71)" },
  { base: "folds", field: "SUBFEATURE", visible: true, name: "Fold axes (CGM 71)" },
  { base: "contacts", field: "SUBFEATURE", visible: false, name: "Contacts (CGM 71)" },
];
export const RAYMOND_POINTS = "bedding.csv";
export const RAYMOND_SET = "Planar measurements (CGM 71)";
export const RAYMOND_TERRAIN = "terrain_cdem_90m.tif";
export const RAYMOND_FILES = [...RAYMOND_LAYERS.flatMap((l) => ["shp", "dbf", "cpg"].map((e) => `${l.base}.${e}`)), RAYMOND_POINTS, RAYMOND_TERRAIN];

// bedding.csv -> the measurements as the structure importer reads them ({ x, y, dip, dipDir, strike, type, cls, station, comment })
export function raymondMeasurements(text) {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  return parseStructureRows(t.data, { x: "easting", y: "northing", dip: "dip", dipDir: "dip_direction", strike: "strike", type: "type", station: "station", comment: "comment" });
}

// readFile(name) -> File; store: { addMapLayer, addSurfaceStructureSet, addTerrain }. Returns notices.
export async function loadMountRaymond(readFile, { addMapLayer, addSurfaceStructureSet, addTerrain }, { projectEpsg = RAYMOND_EPSG } = {}) {
  const notes = [];
  const bytes = async (name) => new Uint8Array(await (await readFile(name)).arrayBuffer());
  // the terrain first, so the map layers drape on it
  try {
    const t = await parseDEMFiles([await readFile(RAYMOND_TERRAIN)], projectEpsg, null, { gridMax: 330 }); // the bundled grid as it is (90 m)
    addTerrain({ name: tr("Terrain (Canadian Digital Elevation Model, 90 m)"), bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask || null, source: { service: "Canadian Digital Elevation Model, Natural Resources Canada (bundled with the sample)", sourcePixelM: 90 } });
  } catch (e) { notes.push(errorNotice(tr("The Mount Raymond terrain could not be loaded: {message}", { message: e.message }))); }
  const added = [];
  for (const L of RAYMOND_LAYERS) {
    try {
      const p = parseShapefileParts({ shp: await bytes(`${L.base}.shp`), dbf: await bytes(`${L.base}.dbf`), cpg: new TextDecoder().decode(await bytes(`${L.base}.cpg`)) });
      const layer = buildLayer({ features: p.features, geomType: p.geomType, name: null, epsg: RAYMOND_EPSG, skippedCount: p.skippedCount }, { sourceName: L.name, projectEpsg });
      if (!layer) continue;
      const styleField = layer.fields.includes(L.field) ? L.field : layer.styleField;
      addMapLayer({ ...layer, styleField, categories: styleField ? autoCategories(layer.features, styleField, autoColorFor()) : [], drapeMode: "terrain", visible: L.visible });
      added.push(`${L.name} (${layer.features.length})`);
    } catch (e) { notes.push(errorNotice(tr("The Mount Raymond layer {name} could not be loaded: {message}", { name: L.name, message: e.message }))); }
  }
  let measurements = 0;
  try {
    const out = raymondMeasurements(await (await readFile(RAYMOND_POINTS)).text());
    // The map's data model gives the dip direction as an azimuth and names no north; a published geological map plots from true north,
    // so they are read as true north and turned to grid north (0.9 to 1.4 degrees added across the sheet). The README says so.
    const c = Number(projectEpsg) === RAYMOND_EPSG ? bearingsToGrid(out.rows, "true", RAYMOND_EPSG) : { rows: out.rows };
    addSurfaceStructureSet({ name: RAYMOND_SET, rows: c.rows, snapToTerrain: true, azimuthRef: Number(projectEpsg) === RAYMOND_EPSG ? "true" : "grid" });
    measurements = out.rows.length;
  } catch (e) { notes.push(errorNotice(tr("The Mount Raymond measurements could not be loaded: {message}", { message: e.message }))); }
  notes.unshift(notice("Loaded the Mount Raymond sample (Geological Survey of Canada, Canadian Geoscience Map 71, northern Yukon; 1:50 000 bedrock mapping, no drillholes): {layers} map layer(s), {n} planar measurement(s), mostly bedding, and a terrain from the Canadian Digital Elevation Model. Try 3D Modelling > Model from map. See sample_data/mount_raymond/README.md for the source and the licence.", { layers: added.length, n: measurements }));
  return notes;
}
