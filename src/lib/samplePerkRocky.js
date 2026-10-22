// TASKS.csv #819 — the Perk-Rocky sample (sample_data/perk_rocky, ARIS assessment report 42317): a surface-mapping
// project with no drillholes. Matt: "add the perk-rocky mapping data as sample data in geostrix". The report's own
// MapInfo layers (read by lib/mapinfoTab.js, #818) become map layers draped on the terrain, its structure points become
// outcrop measurements, and a Copernicus GLO-30 terrain (bundled, built by scripts/samples/build-perk-rocky.mjs) is the
// ground, so "Model from map" (#817) works offline. Each part is independent: one failing does not stop the others.
import { parseMapInfoTab } from "./mapinfoTab.js";
import { buildLayer, autoColorFor } from "./mapLayerBuild.js";
import { autoCategories, guessStructureColumns, parseStructureRows } from "./mapLayers.js";
import { parseDEMFiles } from "./raster.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

export const PERK_EPSG = 26910; // NAD83 / UTM zone 10N, the mapping's own grid
// base name, the attribute to colour by, shown at start
export const PERK_LAYERS = [
  { base: "PR-Litho_interpV3", field: "Litho_code", visible: true },
  { base: "PR-Str_interp", field: "Structure_Type", visible: true },
  { base: "PR_Master_StLines_Sept03_2024", field: "Structure", visible: false },
  { base: "PR_Master_LithOut_Oct17_2024", field: "LithoCode", visible: false },
  { base: "PR-Alt_interpV2", field: "Alt_code", visible: false },
];
export const PERK_POINTS = "PR_Master_StrPoint_Oct17_2024";
export const PERK_TERRAIN = "terrain_copernicus_glo30.tif";
export const PERK_FILES = [...[...PERK_LAYERS.map((l) => l.base), PERK_POINTS].flatMap((b) => ["TAB", "MAP", "ID", "DAT"].map((e) => `${b}.${e}`)), PERK_TERRAIN];

// readFile(name) -> File; store: { addMapLayer, addSurfaceStructureSet, addTerrain }. Returns notices.
export async function loadPerkRocky(readFile, { addMapLayer, addSurfaceStructureSet, addTerrain }, { projectEpsg = PERK_EPSG } = {}) {
  const notes = [];
  const bytes = async (name) => new Uint8Array(await (await readFile(name)).arrayBuffer());
  const tab = async (base) => parseMapInfoTab({ tab: await bytes(`${base}.TAB`), map: await bytes(`${base}.MAP`), id: await bytes(`${base}.ID`), dat: await bytes(`${base}.DAT`), name: base });
  // the terrain first, so the map layers drape on it
  try {
    const t = await parseDEMFiles([await readFile(PERK_TERRAIN)], projectEpsg, null, { gridMax: 320 }); // the bundled grid as it is (~30 m, GLO-30's own)
    addTerrain({ name: tr("Terrain (Copernicus GLO-30, ~30 m)"), bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask || null, source: { service: "Copernicus DEM GLO-30 (bundled with the sample)", sourcePixelM: 30 } });
  } catch (e) { notes.push(errorNotice(tr("The Perk-Rocky terrain could not be loaded: {message}", { message: e.message }))); }
  const added = [];
  for (const L of PERK_LAYERS) {
    try {
      const { layers } = await tab(L.base);
      for (const p of layers) {
        const layer = buildLayer({ features: p.features, geomType: p.geomType, name: layers.length > 1 ? p.name : null, epsg: p.epsg, skippedCount: p.skippedCount }, { sourceName: L.base, projectEpsg });
        if (!layer) continue;
        const styleField = layer.fields.includes(L.field) ? L.field : layer.styleField;
        addMapLayer({ ...layer, styleField, categories: styleField ? autoCategories(layer.features, styleField, autoColorFor()) : [], drapeMode: "terrain", visible: L.visible });
        added.push(`${L.base} (${layer.features.length})`);
      }
    } catch (e) { notes.push(errorNotice(tr("The Perk-Rocky layer {name} could not be loaded: {message}", { name: L.base, message: e.message }))); }
  }
  let measurements = 0;
  try {
    const { layers } = await tab(PERK_POINTS);
    const pts = layers.find((l) => l.geomType === "point" && !l.isText);
    const rows = pts.features.map((f) => ({ ...f.attributes, Easting: f.geometry[0][0], Northing: f.geometry[0][1] }));
    const cols = guessStructureColumns([...new Set(rows.flatMap((r) => Object.keys(r)))]);
    cols.x = "Easting"; cols.y = "Northing";
    const out = parseStructureRows(rows, cols);
    // The mapping does not say whether dip directions are grid, true or magnetic north; they are taken as grid north
    // (the README says so). At this site grid convergence is ~1.6° and declination ~16°.
    addSurfaceStructureSet({ name: PERK_POINTS, rows: out.rows, snapToTerrain: true, azimuthRef: "grid" });
    measurements = out.rows.length;
  } catch (e) { notes.push(errorNotice(tr("The Perk-Rocky structure measurements could not be loaded: {message}", { message: e.message }))); }
  notes.unshift(notice("Loaded the Perk-Rocky sample (BC assessment report #42317, 2024 mapping, no drillholes): {layers} map layer(s), {n} outcrop measurement(s) and a Copernicus GLO-30 terrain. Try 3D Modelling > Model from map. See sample_data/perk_rocky/README.md.", { layers: added.length, n: measurements }));
  return notes;
}
