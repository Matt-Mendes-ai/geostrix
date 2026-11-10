// TASKS.csv #609 — builds a store-ready map layer (Map layers, #316) from a parsed vector layer. Moved out of
// SurfaceMappingPanel.jsx so the 3D view's drop can send a line / polygon shapefile to Map layers too.
import { CATEGORICAL_SAFE_COLORS } from "./layers.js";
import { readsAsMineGrid, mineToProject, partsBox } from "./mineGrid.js"; // TASKS.csv #2586
import { fileToLocal } from "./localGridTie.js"; // TASKS.csv #2320
import { reprojectXY, getProj4DefSync, prjRefusal, datumNote } from "./reproject.js";
import { autoCategories, applyQmlToCategories, guessStyleField, normalizeMapLayer } from "./mapLayers.js";
import { graduatedStyle, isIdField } from "./mapGraduated.js"; // TASKS.csv #1600

// A .qml names its attribute as QGIS saw it ("lith"); the same layer exported as a shapefile comes back
// with DBF-uppercased names ("LITH"). Match case-insensitively and use the layer's own spelling.
export const findField = (fields, name) => (name ? fields.find((f) => f.toLowerCase() === String(name).toLowerCase()) || null : null);

export const autoColorFor = () => {
  let i = 0;
  const seen = new Map();
  return (value) => {
    if (!seen.has(value)) seen.set(value, CATEGORICAL_SAFE_COLORS[i++ % CATEGORICAL_SAFE_COLORS.length]);
    return seen.get(value);
  };
};

// Builds a store-ready map layer from a parsed vector layer. Reprojects into the project CRS when the
// source CRS is known and differs (and both are codes reproject.js can build); otherwise the coordinates
// are taken as already being in the project CRS, and the returned note says so.
// TASKS.csv #1715 (review #1645, Copley) — the project area a map layer is clipped to: the collars and surface samples (project CRS),
// widened by their own size or 5 km, whichever is more. null with nothing to measure (a first import sets the area itself).
export function projectClipBox(points) {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of points || []) { if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue; if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  if (!Number.isFinite(xmin)) return null;
  const pad = Math.max(5000, Math.hypot(xmax - xmin, ymax - ymin));
  return [xmin - pad, ymin - pad, xmax + pad, ymax + pad];
}

// clipTo (optional, #1715): [xmin, ymin, xmax, ymax] in the project CRS — features whose extent lies wholly outside are left out BEFORE
// reprojection (a province-wide map: 33,532 polygons, none within 70 km of Copley, froze the window 28 s and took the autosave to 113 MB).
// The result carries clipped: { kept, total }; when nothing is inside, { outside: total } (and no layer).
// tie (TASKS.csv #2320): a local-grid project's tie (lib/localGridTie.js): a file with a CRS comes INTO the grid through it
// mineGrid / collars (TASKS.csv #2586): as lib/boundaryImport.js — a file with no CRS whose coordinates lie on the project's mine grid
export function buildLayer(parsed, { sourceName, projectEpsg, qml, sourceOverride, clipTo = null, tie = null, mineGrid = null, collars = null }) {
  // #488 — a Source CRS chosen in the panel wins over the file's own (.prj / GeoPackage) CRS
  const src = sourceOverride ? Number(sourceOverride) : parsed.epsg ? Number(parsed.epsg) : null;
  const dst = projectEpsg ? Number(projectEpsg) : null;
  let transform;
  let crsNote;
  if (tie && src && (Number(src) === Number(tie.epsg) || getProj4DefSync(src))) { // #2320
    transform = (x, y) => { const r = fileToLocal(tie, x, y, src); return r ? [r.x, r.y] : [x, y]; };
    crsNote = `brought into the local grid through its tie to EPSG:${tie.epsg} (from EPSG:${src})`;
  } else if (src && dst && src !== dst && getProj4DefSync(src) && getProj4DefSync(dst)) {
    transform = (x, y) => { const r = reprojectXY(x, y, src, dst); return r ? [r.x, r.y] : [x, y]; };
    const datum = datumNote(src); // #1244 — NAD27 and the like: how good the shift is
    crsNote = `reprojected EPSG:${src} → EPSG:${dst}${datum ? ` ⚠ ${datum}` : ""}`;
  } else if (src && dst && src !== dst) {
    crsNote = `source EPSG:${src} could not be reprojected — assumed to already match EPSG:${dst}`;
  } else if (!src) {
    const refused = prjRefusal(parsed.prjWkt); // #1243
    const box = mineGrid ? partsBox((parsed.features || []).flatMap((f) => (f.parts?.length ? f.parts : [f.geometry || []]))) : null;
    if (!refused && box && readsAsMineGrid(box, mineGrid, collars, dst)) { // #2586
      transform = mineToProject(mineGrid, dst);
      crsNote = `no CRS in file; its coordinates lie on the project's mine grid${mineGrid.name ? ` (${mineGrid.name})` : ""} where the collars are — read on that grid, into EPSG:${dst} through its tie`;
    } else crsNote = refused ? `its .prj (${refused}) matches no CRS GeoStrix knows — assumed EPSG:${dst ?? "?"}; set the Source CRS if that is wrong` : `no CRS in file — assumed EPSG:${dst ?? "?"}`;
  } else {
    crsNote = `EPSG:${src}`;
  }
  let clipped = null;
  if (clipTo && (parsed.features || []).length) {
    const tf = transform || ((x, y) => [x, y]);
    const total = parsed.features.length;
    const inside = parsed.features.filter((f) => {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const part of (f.parts && f.parts.length ? f.parts : [f.geometry || []])) for (const pt of part) { const x = pt[0], y = pt[1]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
      if (!Number.isFinite(a)) return false;
      const cs = [tf(a, b), tf(a, d), tf(c, b), tf(c, d)];
      const xs = cs.map((q) => q[0]), ys = cs.map((q) => q[1]);
      return Math.max(...xs) >= clipTo[0] && Math.min(...xs) <= clipTo[2] && Math.max(...ys) >= clipTo[1] && Math.min(...ys) <= clipTo[3];
    });
    if (!inside.length) return { outside: total, sourceName, crsNote };
    if (inside.length < total) { parsed = { ...parsed, features: inside }; clipped = { kept: inside.length, total }; }
  }
  const norm = normalizeMapLayer(parsed, transform);
  if (!norm.features.length) return null;
  const qmlField = findField(norm.fields, qml?.field);
  let styleField = qmlField || guessStyleField(norm.fields);
  if (!qmlField && styleField && isIdField(norm.features, styleField)) styleField = norm.fields.find((f) => f !== styleField && !isIdField(norm.features, f)) || styleField; // #1600 - not a sample number
  const grad = !qmlField ? graduatedStyle(norm.features, styleField) : null; // #1600 - a numeric field in classes, not one colour per value
  let categories = grad ? grad.categories : styleField ? autoCategories(norm.features, styleField, autoColorFor()) : [];
  if (qml && qmlField) categories = applyQmlToCategories(categories, qml);
  return {
    name: norm.name && norm.name !== sourceName ? `${sourceName} — ${norm.name}` : sourceName,
    sourceName, geomType: norm.geomType, features: norm.features, fields: norm.fields, bbox: norm.bbox,
    styleField, categories, ...(grad ? { styleBreaks: grad.styleBreaks } : {}),
    opacity: qml ? Math.max(0.15, qml.opacity) : (norm.geomType === "polygon" ? 0.6 : 1),
    sourceEpsg: src, crsNote, skipped: parsed.skippedCount || 0, ...(clipped ? { clipped } : {}), ...(norm.hasZ ? { hasZ: true } : {}), // hasZ: #1601
  };
}


// TASKS.csv #2019 (review #2013, Import) — the same IP-line shapefile dropped twice (the 3D view, then Maps) made two identical Map layers
// with no word. -> the layer already in `mapLayers` that is this one again (same name, geometry type, feature count and extent), or null.
export function sameMapLayer(mapLayers, layer) {
  if (!layer) return null;
  const box = (b) => (Array.isArray(b) ? b.map((v) => Math.round(v)).join(",") : "");
  return (mapLayers || []).find((l) => (l.sourceName || l.name) === (layer.sourceName || layer.name) && l.geomType === layer.geomType
    && (l.features || []).length === (layer.features || []).length && box(l.bbox) === box(layer.bbox)) || null;
}

// TASKS.csv #2019 — what a drop on the Maps tab's map does with each file: rasters to the raster import, GIS vector files read here
// (lines / polygons become Map layers; points, tables and multi-layer files go to the 3D view's import, which has the mapping dialog
// and the layer picker), drillhole tables to the 3D view, anything else named.
export function mapsDropRoutes(names) {
  const out = { raster: [], vector: [], table: [], other: [] };
  for (const n of names || []) {
    if (/\.(tiff?|gxf|grd)$/i.test(n)) out.raster.push(n);
    else if (/\.(shp|zip|gpkg|kml|kmz)$/i.test(n)) out.vector.push(n);
    else if (/\.(csv|xlsx|las|dxf)$/i.test(n)) out.table.push(n);
    else out.other.push(n);
  }
  return out;
}
