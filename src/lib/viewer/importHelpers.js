// TASKS.csv #445 step 3 — the import pipeline's plain helpers (row normalisers, file-type sniffing, the vector /
// GeoPackage / raster loaders), moved unchanged from the top of ViewerModule.jsx with their comments; used by
// modules/viewer/useImportPipeline.js and ViewerModule.jsx.
import { guessEpsgFromPrjWkt } from "../reproject.js";
import { readKmlFile, kmlFeaturesToRows } from "../kml.js";
import { isElementColumn } from "../geochem.js"; // TASKS.csv #600
import { xlsxToCsvFiles } from "../xlsx.js"; // TASKS.csv #605
import { parseShapefileZip, parseShapefileParts, shapefileFeaturesToRows } from "../shapefile.js";
import { num, isOverturnedValue } from "../layers.js";
import { parseTableFile, parseTableText } from "../tabular.js";

export function normInterval(r, mapping, customFields) {
  return applyCustomFields({
    hole_id: String(r[mapping.hole_id] ?? "").trim(),
    from: num(r[mapping.from]), // TASKS.csv #337 — blank is missing, not 0
    to: num(r[mapping.to]),
    value: String(r[mapping.value] ?? "Unknown").trim(),
    extra: mapping.extra ? num(r[mapping.extra]) : undefined,
    description: mapping.description ? (String(r[mapping.description] ?? "").trim() || undefined) : undefined,
  }, r, customFields);
}

// TASKS.csv #208 — generic "extra fields" plumbing, designed once and reused by every row-builder
// below (and by the collars/survey/custom branches of commitImportData directly) rather than a
// one-off special case just for litho's new `description` field. customFields is an array of
// {column, name} pairs the user maps in ImportMappingModal — each maps an arbitrary source column
// into an arbitrarily-named field on the imported row, carried straight through to the attribute
// table (AttributeTableModal already derives its columns from Object.keys() of whatever a row
// actually has, so this needs zero changes there) and hover tooltips (added explicitly below, since
// those use fixed string templates rather than iterating keys).
// TASKS.csv #213 — user request: "other software will let the user assign a data type to the added
// column eg. text, number, category, etc." `type` (added alongside column/name in ImportMappingModal)
// controls how the raw CSV value is coerced: "number" parses it so the field behaves like any other
// numeric layer value (filterable/sortable), "category" trims it to a clean string for a coded value
// expected to match consistently, "text" (the default, and the ONLY behavior before this fix) keeps
// it exactly as Papa Parse read it, unchanged, for full backward compatibility with any code path that
// still passes {column, name} pairs with no type at all.
export function applyCustomFields(row, r, customFields) {
  if (!customFields || !customFields.length) return row;
  customFields.forEach(({ column, name, type }) => {
    if (!column || !name) return;
    const raw = r[column];
    row[name] = type === "number" ? (raw === "" || raw == null ? null : Number(raw))
      : type === "category" ? String(raw ?? "").trim()
      : raw;
  });
  return row;
}

export function normNumericInterval(r, mapping, customFields) {
  // TASKS.csv #605 — point readings (mag sus by depth): from = to = depth
  const pointDepth = !mapping.from && mapping.depth ? num(r[mapping.depth]) : null;
  return applyCustomFields({
    hole_id: String(r[mapping.hole_id] ?? "").trim(),
    from: pointDepth ?? num(r[mapping.from]), // TASKS.csv #337 — a blank RQD/recovery/magsusc cell is missing, not 0
    to: pointDepth ?? num(r[mapping.to]),
    value: num(r[mapping.value]),
  }, r, customFields);
}

export function normStructure(r, mapping, customFields, dipConvention) {
  // TASKS.csv #426 — dip must be 0-90 and dip direction 0-360; anything else is dropped to "unknown"
  // (NaN) and counted by the caller, instead of a dip of -30 plotting as a horizontal plane. A negative
  // dip is only accepted as a sign convention when the user said so (dipConvention "neg_down").
  let dip = mapping.dip ? num(r[mapping.dip]) : undefined;
  if (Number.isFinite(dip) && dip < 0 && dipConvention === "neg_down") dip = -dip;
  if (Number.isFinite(dip) && (dip < 0 || dip > 90)) dip = NaN;
  let azimuth = mapping.azimuth ? num(r[mapping.azimuth]) : undefined;
  if (!Number.isFinite(azimuth) && mapping.strike) {
    const strike = num(r[mapping.strike]);
    if (Number.isFinite(strike)) azimuth = (((strike + 90) % 360) + 360) % 360; // right-hand rule
  }
  if (Number.isFinite(azimuth)) azimuth = azimuth === 360 ? 0 : (azimuth < 0 || azimuth > 360 ? NaN : azimuth);
  const alpha = mapping.alpha ? num(r[mapping.alpha]) : NaN, beta = mapping.beta ? num(r[mapping.beta]) : NaN; // #427
  return applyCustomFields({
    hole_id: String(r[mapping.hole_id] ?? "").trim(),
    depth: num(r[mapping.depth]), // TASKS.csv #337
    value: String(r[mapping.value] ?? "").trim(),
    dip,
    azimuth,
    ...(Number.isFinite(alpha) ? { alpha } : {}),
    ...(Number.isFinite(beta) ? { beta } : {}),
    ...(mapping.structure_id && String(r[mapping.structure_id] ?? "").trim() ? { structure_id: String(r[mapping.structure_id]).trim() } : {}), // #362
    ...(mapping.overturned && isOverturnedValue(r[mapping.overturned]) ? { overturned: true } : {}), // #430
  }, r, customFields);
}

// TASKS.csv #289 / #439 — raster.js (and geotiff) loaded on first raster import, not at startup.
export const loadRaster = () => import("../raster.js");

// TASKS.csv #600 — element columns are recognised the way the assay importer itself reads them
// (isElementColumn: "Au_gpt_BESTEL", "Ag_XRF_ppm", "Cu (ppm)", "SiO2"), counting DISTINCT elements, not only
// headers that are exactly a symbol: a real ARIS assay export (Au_gpt_BESTEL ...) and a pXRF export were
// not recognised as assays and were offered as vein / alteration layers instead. Words that start with a
// symbol but are descriptive ("Ag status", "Au certificate") are not element columns.
const NOT_GRADE = /\b(status|certificate|cert|laboratory|lab|method|date|completed|analys(is|ed)|comment|flag|qc|batch|job|error|err|lod|dl)\b/i;
export function looksLikeAssay(headers) {
  const syms = new Set();
  headers.forEach((h) => { if (NOT_GRADE.test(String(h).replace(/_/g, " "))) return; const s = isElementColumn(h); if (s) syms.add(s); });
  return syms.size >= 4;
}

// TASKS.csv #190/#191 — user request: "let's do those 3" (shapefile import, GeoPackage export,
// GeoPackage import). Both new import formats get converted to the exact same flat-row-array shape
// Papa.parse already produces for a CSV (via shapefileFeaturesToRows/gpkgFeaturesToRows), so every
// existing CSV-shaped import consumer (openImportModal below, and GeophysicsModule's block-model
// import) can accept a shapefile .zip or a .gpkg with no format-specific logic beyond this one
// dispatch point — extension decides which parser runs, everything downstream is unchanged.
// onDone(rows, errorMessage, meta) — meta.note is an optional extra string (multi-layer/skipped-
// feature caveats) the caller should fold into its own notice rather than silently dropping.
// TASKS.csv #288 — `chosenLayer` (a layer/table NAME) selects which layer of a multi-layer .zip or
// multi-table .gpkg to read. When a file has more than one and the caller hasn't chosen yet, this
// reports the available layers back through meta.layerOptions and imports NOTHING, so the caller can
// put a picker up instead of silently taking the first one (which is what it used to do).
// TASKS.csv #600 — a shapefile is usually delivered LOOSE (.shp + .dbf + .prj [+ .shx/.cpg], no .zip; e.g. an
// ARIS report's "Collar Locations _All"). The 3D view used to queue the .shp alone and skip the rest as
// unrecognised, so a collar shapefile arrived with no hole ids and no CRS. groupShapefileParts attaches each
// .shp's same-basename siblings to it (file.shpParts) and drops them from the list; the same pairing the Map
// layers panel already does (#415). Returns { files, unmatched } (sidecars with no .shp in the selection).
export const SHAPEFILE_SIDECAR = /\.(dbf|prj|cpg|shx|qix|sbn|sbx|xml)$/i;
export function groupShapefileParts(list) {
  const base = (n) => n.toLowerCase().replace(/\.shp\.xml$|\.[^.]+$/, "");
  const shps = new Map();
  list.forEach((f) => { if (/\.shp$/i.test(f.name)) shps.set(base(f.name), f); });
  const files = [], unmatched = [];
  list.forEach((f) => {
    if (!SHAPEFILE_SIDECAR.test(f.name)) { files.push(f); return; }
    const shp = shps.get(base(f.name));
    if (!shp) { unmatched.push(f); return; }
    const ext = f.name.toLowerCase().match(/\.([^.]+)$/)[1];
    if (["dbf", "prj", "cpg"].includes(ext)) shp.shpParts = { ...(shp.shpParts || {}), [ext]: f };
  });
  return { files, unmatched };
}
async function readLooseShapefile(file) {
  const parts = file.shpParts || {};
  return parseShapefileParts({
    shp: new Uint8Array(await file.arrayBuffer()),
    dbf: parts.dbf ? new Uint8Array(await parts.dbf.arrayBuffer()) : null,
    cpg: parts.cpg ? await parts.cpg.text() : null,
  }, 0, parts.prj ? await parts.prj.text() : null);
}

export function parseVectorFile(file, onDone, chosenLayer = null) {
  const name = file.name.toLowerCase();
  // TASKS.csv #424 — KML/KMZ waypoints and tracks: lon/lat rows with the source CRS set to EPSG:4326
  // (KML is always WGS84), so the normal import step reprojects them to the project CRS.
  if (name.endsWith(".kml") || name.endsWith(".kmz")) {
    readKmlFile(file).then(({ features, skipped }) => {
      if (!features.length) { onDone(null, "No placemarks with coordinates found in this KML."); return; }
      const { rows, headers } = kmlFeaturesToRows(features);
      const nPts = features.filter((f) => f.geomType === "point").length;
      let note = ` KML: ${nPts} point(s), ${features.length - nPts} line/polygon(s) (one row per vertex, with part/vertex numbers). Coordinates are WGS84 longitude/latitude — Source CRS set to EPSG:4326 so they are reprojected to the project CRS.`;
      if (skipped) note += ` ${skipped} placemark(s) without Point/LineString/Polygon geometry were skipped.`;
      onDone(rows, null, { headers, note, detectedEpsg: 4326 });
    }).catch((err) => onDone(null, err.message));
    return;
  }
  // TASKS.csv #605 — an Excel workbook through an Import button: one sheet is read straight away; several go
  // through the same picker as a multi-layer .zip / .gpkg (#288), named by sheet. (A dropped workbook is
  // instead expanded into one queued file per sheet — useImportPipeline.handleDrop.)
  if (name.endsWith(".xlsx")) {
    file.arrayBuffer().then((buf) => xlsxToCsvFiles(new Uint8Array(buf), file.name)).then((sheets) => {
      if (!sheets.length) { onDone(null, "No sheet with a header row and data in this workbook."); return; }
      const pick = chosenLayer ? sheets.find((s) => s.sheet === chosenLayer) : sheets.length === 1 ? sheets[0] : null;
      if (!pick) { onDone(null, null, { layerOptions: sheets.map((s) => ({ name: s.sheet, count: s.rows, unit: "row" })) }); return; }
      const t = parseTableText(pick.text);
      onDone(t.rows, null, { headers: t.headers, note: ` Sheet "${pick.sheet}" of ${file.name}.${t.note ? ` ${t.note}` : ""}` });
    }).catch((err) => onDone(null, err.message));
    return;
  }
  if (name.endsWith(".gpkg")) {
    let gpkgFeaturesToRows;
    Promise.all([file.arrayBuffer(), loadGpkg()]).then(([buf, g]) => { gpkgFeaturesToRows = g.gpkgFeaturesToRows; return g.parseGeoPackage(buf); }).then(({ layers }) => {
      const usable = layers.filter((l) => l.features.length);
      if (!usable.length) { onDone(null, "No usable point/line features found in this GeoPackage."); return; }
      if (usable.length > 1 && !chosenLayer) {
        onDone(null, null, { layerOptions: usable.map((l) => ({ name: l.name, count: l.features.length, geomType: l.geomType })) });
        return;
      }
      const layer = (chosenLayer && usable.find((l) => l.name === chosenLayer)) || usable[0];
      const { rows, headers } = gpkgFeaturesToRows(layer);
      let note = "";
      if (usable.length > 1) note += ` Imported the "${layer.name}" table of ${usable.length} in this GeoPackage — open the file again to bring in another one.`;
      if (layer.skippedCount) note += ` ${layer.skippedCount} feature(s) with an unsupported/empty geometry were skipped.`;
      // TASKS.csv #223 — GeoPackage already read its own SRS registry properly (gpkg_spatial_ref_sys,
      // a structured field, more reliable than shapefile's .prj WKT-name-sniffing above) but never
      // surfaced it as a Source CRS suggestion — same fix, same "only ever suggests" caveat.
      const detectedEpsg = layer.epsg ? Number(layer.epsg) : null;
      if (detectedEpsg) note += ` Detected source CRS EPSG:${detectedEpsg} from this GeoPackage's own SRS registry — pre-filled below, double-check it's correct.`;
      onDone(rows, null, { headers, note, detectedEpsg });
    }).catch((err) => onDone(null, err.message));
    return;
  }
  if (name.endsWith(".zip") || name.endsWith(".shp")) {
    const reader = name.endsWith(".zip")
      ? file.arrayBuffer().then((buf) => parseShapefileZip(buf, chosenLayer))
      : readLooseShapefile(file);
    reader.then((parsed) => {
      // TASKS.csv #288 — same "ask, don't silently take the first one" gate as the GeoPackage branch
      // above. parseShapefileZip now returns the real basenames, not just a count of the skipped ones.
      if (parsed.layerNames?.length > 1 && !chosenLayer) {
        onDone(null, null, { layerOptions: parsed.layerNames.map((n) => ({ name: n })) });
        return;
      }
      const { rows, headers } = shapefileFeaturesToRows(parsed);
      let note = "";
      if (parsed.otherBaseNames) note += ` This .zip bundles ${parsed.otherBaseNames + 1} separate shapefiles — "${parsed.layerName}" was imported; open the file again to pick another.`;
      if (parsed.skippedCount) note += ` ${parsed.skippedCount} feature(s) with an unsupported shape type were skipped.`;
      if (parsed.hasAttributes === false) note += " No .dbf attribute table came with the .shp — only coordinates came through. Select or drop the .shp together with its .dbf and .prj (or a .zip of them).";
      // TASKS.csv #223 — read the .prj sidecar's declared CRS instead of silently ignoring it. Only
      // ever SUGGESTS a Source CRS for the user to confirm (prefills the import modal's field, doesn't
      // reproject unasked) — guessEpsgFromPrjWkt returns null for anything it can't confidently
      // recognize, so an unmatched .prj falls through to exactly today's behavior (ask the user).
      let detectedEpsg = null;
      if (parsed.prjWkt) {
        detectedEpsg = guessEpsgFromPrjWkt(parsed.prjWkt);
        note += detectedEpsg
          ? ` Detected source CRS EPSG:${detectedEpsg} from the bundled .prj file — pre-filled below, double-check it's correct.`
          : " This shapefile includes a .prj file, but its CRS wasn't one GeoStrix recognizes automatically — set Source CRS manually below if it's not already in the project's EPSG.";
      }
      onDone(rows, null, { headers, note, detectedEpsg, vector: parsed }); // vector: #609 (lines / polygons -> Map layers)
    }).catch((err) => onDone(null, err.message));
    return;
  }
  // TASKS.csv #284 — the comma-decimal note rides the existing meta.note channel, so it surfaces in
  // the same toast/notice every other import caveat already uses (no new plumbing).
  parseCSV(file, (data, err, localeNote) => onDone(data, err, { headers: data && data.length ? Object.keys(data[0]) : [], note: localeNote || "" }));
}

// TASKS.csv #439 — gpkg.js (and with it sql.js) is loaded on first GeoPackage import/export, not at
// startup: it was pulling sql.js into the eagerly-loaded bundle for a feature most sessions never touch.
export const loadGpkg = () => import("../gpkg.js");

// onDone(rows, errorMessage, localeNote) — TASKS.csv #284: Papa's dynamicTyping leaves a
// European-locale value like "1,5" as the literal STRING "1,5", and Number("1,5") is NaN, so every
// numeric filter downstream silently dropped the whole row and the only symptom was a short row count
// in the toast. normalizeCommaDecimals converts the columns it can PROVE are comma-decimal and hands
// back a note explaining what it did (or, for the genuinely ambiguous "1,234" case, what it
// deliberately did NOT do) — see src/lib/numberLocale.js for the heuristic and why it's shaped that way.
export function parseCSV(file, onDone) {
  // TASKS.csv #444 — the shared reader (lib/tabular.js): the same #284 comma-decimal handling and #404
  // stamp skipping as before, plus the Windows-1252 fallback for Excel exports.
  parseTableFile(file).then((t) => onDone(t.rows, null, t.note ? ` ${t.note.trim()}` : ""), (err) => onDone(null, err.message));
}
