// TASKS.csv #609 — builds a store-ready map layer (Map layers, #316) from a parsed vector layer. Moved out of
// SurfaceMappingPanel.jsx so the 3D view's drop can send a line / polygon shapefile to Map layers too.
import { CATEGORICAL_SAFE_COLORS } from "./layers.js";
import { reprojectXY, getProj4DefSync } from "./reproject.js";
import { autoCategories, applyQmlToCategories, guessStyleField, normalizeMapLayer } from "./mapLayers.js";

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
export function buildLayer(parsed, { sourceName, projectEpsg, qml, sourceOverride }) {
  // #488 — a Source CRS chosen in the panel wins over the file's own (.prj / GeoPackage) CRS
  const src = sourceOverride ? Number(sourceOverride) : parsed.epsg ? Number(parsed.epsg) : null;
  const dst = projectEpsg ? Number(projectEpsg) : null;
  let transform;
  let crsNote;
  if (src && dst && src !== dst && getProj4DefSync(src) && getProj4DefSync(dst)) {
    transform = (x, y) => { const r = reprojectXY(x, y, src, dst); return r ? [r.x, r.y] : [x, y]; };
    crsNote = `reprojected EPSG:${src} → EPSG:${dst}`;
  } else if (src && dst && src !== dst) {
    crsNote = `source EPSG:${src} could not be reprojected — assumed to already match EPSG:${dst}`;
  } else if (!src) {
    crsNote = `no CRS in file — assumed EPSG:${dst ?? "?"}`;
  } else {
    crsNote = `EPSG:${src}`;
  }
  const norm = normalizeMapLayer(parsed, transform);
  if (!norm.features.length) return null;
  const qmlField = findField(norm.fields, qml?.field);
  const styleField = qmlField || guessStyleField(norm.fields);
  let categories = styleField ? autoCategories(norm.features, styleField, autoColorFor()) : [];
  if (qml && qmlField) categories = applyQmlToCategories(categories, qml);
  return {
    name: norm.name && norm.name !== sourceName ? `${sourceName} — ${norm.name}` : sourceName,
    sourceName, geomType: norm.geomType, features: norm.features, fields: norm.fields, bbox: norm.bbox,
    styleField, categories,
    opacity: qml ? Math.max(0.15, qml.opacity) : (norm.geomType === "polygon" ? 0.6 : 1),
    sourceEpsg: src, crsNote, skipped: parsed.skippedCount || 0,
  };
}

