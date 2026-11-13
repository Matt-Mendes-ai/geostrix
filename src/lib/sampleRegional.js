// TASKS.csv #3107 — the regional samples built from geological surveys' open map services: map layers (zipped shapefiles), and where a
// sample has them a terrain, outcrop measurements and surface samples. Central Lapland (Geological Survey of Finland, CC BY 4.0): the
// 1:1 000 000 bedrock units and faults of a 100 km window, and 121 whole-rock samples with their full analyses, no drillholes. Any
// drillhole tables of a sample go through the normal import queue (viewer/useImportPipeline.js SAMPLES). Each part is independent: one
// failing does not stop the others.
import Papa from "papaparse";
import { parseShapefileZip } from "./shapefile.js";
import { buildLayer, autoColorFor } from "./mapLayerBuild.js";
import { autoCategories, parseStructureRows } from "./mapLayers.js";
import { bearingsToGrid } from "./azimuthRef.js";
import { mergeSurfaceSamples } from "./geochem.js";
import { waSurface } from "./sampleWa.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

// which -> its folder and parts. Layer and set names are project data (English in every language).
export const REGIONAL_SAMPLES = {
  fi_lapland: {
    dir: "fi_lapland", epsg: 25835, crs: "ETRS89 / UTM zone 35N", label: "Central Lapland",
    layers: [
      { zip: "bedrock_units.zip", field: "ROCK_NAME", visible: true, name: "Bedrock units (GTK, 1:1 000 000)" },
      { zip: "faults.zip", field: "FAULT_TYPE", visible: true, name: "Faults (GTK, 1:1 000 000)" },
    ],
    surface: [["rocks.csv", "rock"]],
    loaded: "Loaded the Central Lapland sample (Geological Survey of Finland; no drillholes): the 1:1 000 000 bedrock units and faults of a 100 km window of the greenstone belt, and 121 whole-rock samples with their major oxides and trace elements. Open Geochem for the rock diagrams. See sample_data/fi_lapland/README.md for the sources and the licence.",
  },
};
export const isRegionalSample = (which) => Object.prototype.hasOwnProperty.call(REGIONAL_SAMPLES, which);

// readFile(name) -> File; store: { addMapLayer, addTerrain, addSurfaceStructureSet, setSurfaceSamples, setSurfaceElements }. -> notices
export async function loadRegionalSample(which, readFile, store, { projectEpsg = null, existingSurfaceElements = [] } = {}) {
  const S = REGIONAL_SAMPLES[which], notes = [];
  if (!S) return notes;
  const epsg = Number(projectEpsg) || S.epsg;
  let hasTerrain = false;
  if (S.terrain) { // first, so the map layers drape on it
    try {
      const { parseDEMFiles } = await import("./raster.js");
      const t = await parseDEMFiles([await readFile(S.terrain.file)], epsg, null, { gridMax: S.terrain.gridMax || 320 });
      store.addTerrain({ name: S.terrain.name, bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask || null, source: { service: S.terrain.source, sourcePixelM: S.terrain.pixel } });
      hasTerrain = true;
    } catch (e) { notes.push(errorNotice(tr("The {name} terrain could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  let layers = 0;
  for (const L of S.layers || []) {
    try {
      const p = await parseShapefileZip(new Uint8Array(await (await readFile(L.zip)).arrayBuffer()));
      const layer = buildLayer({ features: p.features, geomType: p.geomType, name: null, epsg: S.epsg, skippedCount: p.skippedCount }, { sourceName: L.name, projectEpsg: epsg });
      if (!layer) continue;
      const styleField = layer.fields.includes(L.field) ? L.field : layer.styleField;
      store.addMapLayer({ ...layer, styleField, categories: styleField ? autoCategories(layer.features, styleField, autoColorFor()) : [], drapeMode: hasTerrain ? "terrain" : "flat", visible: L.visible });
      layers++;
    } catch (e) { notes.push(errorNotice(tr("The {name} layer {layer} could not be loaded: {message}", { name: S.label, layer: L.name, message: e.message }))); }
  }
  let measurements = 0;
  if (S.structures) {
    try {
      const t = Papa.parse(await (await readFile(S.structures.file)).text(), { header: true, skipEmptyLines: true, dynamicTyping: false });
      const out = parseStructureRows(t.data, S.structures.columns);
      const north = S.structures.north || "grid", same = epsg === S.epsg;
      const rows = same ? bearingsToGrid(out.rows, north, S.epsg).rows : out.rows;
      store.addSurfaceStructureSet({ name: S.structures.name, rows, snapToTerrain: true, azimuthRef: same ? north : "grid" });
      measurements = out.rows.length;
    } catch (e) { notes.push(errorNotice(tr("The {name} measurements could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  let samples = 0;
  if (S.surface) {
    try {
      const all = [], els = new Map();
      for (const [file, medium] of S.surface) {
        const r = waSurface(await (await readFile(file)).text(), medium);
        all.push(...r.samples);
        r.elements.forEach((e) => { if (!els.has(e.symbol)) els.set(e.symbol, e); });
      }
      const unitOf = new Map((existingSurfaceElements || []).map((e) => [e.symbol, e.unit]));
      store.setSurfaceSamples((prev) => mergeSurfaceSamples(prev || [], all).samples);
      store.setSurfaceElements((prev) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); els.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, unitOf.has(e.symbol) ? { ...e, unit: unitOf.get(e.symbol) } : e); }); return Array.from(m.values()); });
      samples = all.length;
    } catch (e) { notes.push(errorNotice(tr("The {name} surface samples could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  notes.unshift(notice(S.loaded, { layers, n: measurements, samples }));
  return notes;
}
