// TASKS.csv #3888 (platform redesign P5, design.md section 4, screens 1 and 2) — the start dialogs' own rules, pure, loaded with StartDialogs.jsx:
//  - dialog 1, the ground: a dropped file read as a terrain, or a table handed on to step 2; "make one for me" waits for the collars;
//  - dialog 2, the checklist: what the project holds now, in plain words (filled in by the ordinary import, "import-dropped-files", not by a
//    second import path);
//  - the coordinate system in plain words.
import { t as tr } from "./i18n.js";
import { rowsOf } from "./rowTable.js";
import { unreadableFormatAdvice } from "./unreadableFormats.js"; // TASKS.csv #3918 — a format GeoStrix knows it cannot read says so, with what to do // a layer or the assays can be a columnar Table (#3424): its length, and rows built on demand

// ---------- dialog 1, the ground ----------
// what a file dropped on the ground step is: "terrain" (a GeoTIFF, read by the terrain importer), "table" (a drill table: it belongs to step 2)
// or "other" (a map, a picture…: also step 2, under 'Anything else')
export function groundFileKind(name) {
  const n = String(name || "").toLowerCase();
  if (/\.(tiff?)$/.test(n)) return "terrain";
  if (/\.(csv|txt|tsv|xlsx?|xls)$/.test(n)) return "table";
  return "other";
}
// one line on a terrain: its size, its lowest and highest ground (and the coordinate system, from crsWords)
export function terrainSummary(t) {
  if (!t?.bbox || !t.elevations) return null;
  let lo = Infinity, hi = -Infinity;
  const e = t.elevations, mask = t.noDataMask;
  for (let i = 0; i < e.length; i++) { const v = e[i]; if (!Number.isFinite(v) || (mask && mask[i])) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi >= lo)) return null;
  const [x0, y0, x1, y1] = t.bbox, km = (v) => (v >= 10000 ? Math.round(v / 1000) : Math.round(v / 100) / 10).toLocaleString();
  return { wKm: km(x1 - x0), hKm: km(y1 - y0), lo: Math.round(lo), hi: Math.round(hi),
    text: tr("Your ground: {w} × {h} km, from {lo} m to {hi} m above sea level.", { w: km(x1 - x0), h: km(y1 - y0), lo: Math.round(lo).toLocaleString(), hi: Math.round(hi).toLocaleString() }) };
}
// the coordinate system in plain words: "Your map uses UTM zone 9 North (NAD83 / UTM zone 9N, EPSG:26909)."
export function crsWords(epsg, name) {
  if (!Number.isFinite(Number(epsg)) || !epsg) return tr("No coordinate system yet: GeoStrix takes it from your first file that has one, or asks.");
  const nm = name || `EPSG:${epsg}`;
  const m = /UTM zone (\d{1,2})\s*([NS])/i.exec(nm);
  if (m) return tr(m[2].toUpperCase() === "N" ? "Your map uses UTM zone {zone} North ({name}, EPSG:{code})." : "Your map uses UTM zone {zone} South ({name}, EPSG:{code}).", { zone: Number(m[1]), name: nm, code: epsg });
  if (Number(epsg) === 4326 || /^WGS 84$/i.test(nm)) return tr("Your map uses latitude and longitude ({name}, EPSG:{code}).", { name: nm, code: epsg });
  return tr("Your map uses {name} (EPSG:{code}).", { name: nm, code: epsg });
}
// the "make the ground" strip (step 2): shown once "make one for me" was chosen, the collars say where the project is, and there is no terrain
export function groundStrip({ choice, collars = 0, terrain = false, epsg = null }) {
  if (choice !== "make" || terrain) return null;
  if (!collars) return { state: "waiting", text: tr("GeoStrix will make the ground once your drill holes say where the project is.") };
  if (!epsg) return { state: "nocrs", text: tr("GeoStrix can't make the ground yet: the project has no coordinate system. Add a terrain later with Add data.") };
  return { state: "ready" };
}

// ---------- dialog 2, the checklist ----------
const count = (a) => Number(a?.length) || 0;
const others = (s) => [
  ...(s.rasters || []).map((r) => r?.name), ...(s.mapLayers || []).map((l) => l?.name), ...(s.boundaries || []).map((b) => b?.name),
  ...(count(s.surfaceSamples) ? [tr("{n} surface samples", { n: count(s.surfaceSamples).toLocaleString() })] : []),
  ...(count(s.surfaceStructures) ? [tr("{n} outcrop readings", { n: count(s.surfaceStructures).toLocaleString() })] : []),
  ...(s.voxelModels || []).map((v) => v?.name),
].filter(Boolean);
// s: the store's collars, survey, layers, assays, assayElements, rasters, mapLayers, boundaries, surfaceSamples, surfaceStructures, voxelModels;
// noDrill: "I'm not using drill hole data" (only 'Anything else'). -> [{ key, label, what, done, detail }]
export function startChecklist(s = {}, { noDrill = false } = {}) {
  const holes = count(s.collars), stations = count(s.survey), litho = s.layers?.litho ? rowsOf(s.layers.litho) || [] : [], structure = count(s.layers?.structure) + count(s.layers?.structzone);
  const codes = new Set(litho.map((r) => r?.value).filter((v) => v != null && v !== "")).size;
  const elements = (s.assayElements || []).map((e) => e?.symbol).filter(Boolean);
  const o = others(s);
  const rows = [
    { key: "collars", label: tr("Drill holes (collars)"), what: tr("where each hole starts"), done: holes > 0, detail: holes ? tr(holes === 1 ? "{n} hole" : "{n} holes", { n: holes.toLocaleString() }) : "" },
    { key: "survey", label: tr("Surveys"), what: tr("how each hole bends"), done: stations > 0, detail: stations ? tr("{n} survey stations", { n: stations.toLocaleString() }) : holes ? tr("None yet: the holes are drawn straight for now.") : "" },
    { key: "litho", label: tr("Rock types (lithology)"), what: tr("what was logged down the hole"), done: litho.length > 0, detail: litho.length ? tr(codes === 1 ? "{n} rock code" : "{n} rock codes", { n: codes }) : "" },
    { key: "assays", label: tr("Assays"), what: tr("lab results"), done: count(s.assays) > 0, detail: count(s.assays) ? elements.slice(0, 10).join(", ") + (elements.length > 10 ? "…" : "") : "" },
    { key: "structure", label: tr("Structures"), what: tr("measured angles of layers, veins and faults"), done: structure > 0, detail: structure ? tr("{n} measurements", { n: structure.toLocaleString() }) : "" },
    { key: "other", label: tr("Anything else"), what: tr("maps, samples, pictures, geophysics"), done: o.length > 0, detail: o.slice(0, 6).join(", ") + (o.length > 6 ? "…" : "") },
  ];
  return noDrill ? rows.filter((r) => r.key === "other") : rows;
}
// where "Done: show my project" goes: Maps when there is no drilling, else the 3D view
export const startDestination = ({ noDrill = false, collars = 0 } = {}) => (noDrill || !collars ? "maps" : "viewer");

// ---------- TASKS.csv #3918 (the start dialogs' follow-ups) ----------
// Screen 3's "Check my data" line, from lib/dataQC.js's summary: fine, or how many things to look at (errors and warnings; notes do not count)
export function qcLine(summary) {
  if (!summary) return null;
  const n = (Number(summary.error) || 0) + (Number(summary.warning) || 0);
  if (!n) return tr("Check my data: your data looks fine.");
  return tr(n === 1 ? "Check my data: {n} thing to look at. Data QC on the StrixViewer ribbon lists it." : "Check my data: {n} things to look at. Data QC on the StrixViewer ribbon lists them.", { n });
}
// a typed coordinate system: "32609", "EPSG:32609", "epsg 32609" -> 32609, else null
export function parseEpsgInput(s) {
  const m = /^\s*(?:epsg\s*[:\s]?\s*)?(\d{4,6})\s*$/i.exec(String(s ?? ""));
  return m ? Number(m[1]) : null;
}
// "What is this?": what the 3D view's drop reads (lib/../modules/viewer/importPipelineImpl.js handleDrop) and the files that come with them
const KNOWN = /\.(csv|zip|gpkg|shp|shx|dbf|prj|cpg|qml|kml|kmz|xlsx|las|laz|tiff?|tfw|tifw|aux|xml|gxf|grd|ers|dxf|obj|ts|gp|pl|str|vo|vs|msh|chg|con|mod|den|sus|edi|xyz|tab|map|id|dat|ind|dfn)$/i;
// -> null for a file the import reads (it decides the rest), or { text, where } for one it can't place: what this step reads, and where it might go
export function whatIsThis(name) {
  const n = String(name || "");
  if (KNOWN.test(n)) return null;
  const advice = unreadableFormatAdvice(n);
  if (advice) return { text: advice, where: null };
  const reads = tr("Here GeoStrix reads tables (CSV, Excel .xlsx), maps (a zipped shapefile, GeoPackage, KML, DXF), grids (GeoTIFF, GXF), lidar (LAS) and 3D shapes (OBJ, GOCAD).");
  let where;
  if (/\.(txt|tsv|asc|xls|ods)$/i.test(n)) where = tr("A table in another format: save it as CSV or .xlsx and drop it again. A survey grid as text goes in Geophysics > Point survey.");
  else if (/\.(png|jpe?g|bmp|gif|webp|pdf)$/i.test(n)) where = tr("A picture or a document: Layout puts pictures on a page; a scanned map can be placed with Georeference on the Maps tab.");
  else if (/\.(geostrix|json)$/i.test(n) || /\.geostrix\.json$/i.test(n)) where = tr("A saved project: open it with Open, not here.");
  else if (/\.(gdb|grd|ers|nc|hdr|img)$/i.test(n)) where = tr("Geophysics data: try the Geophysics tab, which reads more survey formats.");
  else where = tr("If it is geophysics, try the Geophysics tab; if it is a table, save it as CSV.");
  return { text: tr("{name}: GeoStrix can't tell what this is.", { name: n }) + " " + reads, where };
}
