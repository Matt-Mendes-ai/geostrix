// Its own file so the DXF writer stays out of the startup bundle (#552: loaded on demand; +10.5 kB when it was not).
import { buildDXF } from "../dxf.js";

// TASKS.csv #1060 / #1017 — the DXF of a drillhole layer or overlay (was inline in ViewerModule exportVectorDXF): an
// interval / point / structure layer gets one DXF layer per logged value (KEY_value), structure picks a "dip/ddd" label;
// collars and traces keep one layer per hole; an overlay (built) brings its own dxfLayerOf. A 999 comment record names
// the export and the project CRS (#1053). Returns { text, perValue, picks }.
export function vectorDxfText({ features, geomType }, { kind, key, built = null, label, crs }) {
  const perValue = !built && kind === "layer" && !!key;
  const valueLayer = perValue ? (f) => `${String(key).toUpperCase()}_${f.attributes?.value ?? f.attributes?.type ?? "NONE"}` : null;
  const picks = !built && key === "structure";
  const pickLabel = picks ? (f) => { const a = f.attributes || {}; return Number.isFinite(a.dip) ? `${Math.round(a.dip)}/${Number.isFinite(a.dipdir_grid) ? String(Math.round(a.dipdir_grid)).padStart(3, "0") : "?"}` : null; } : null;
  const text = `999\nGeoStrix ${label} | Project CRS: ${crs}\n` + buildDXF({ features, geomType, layerOf: valueLayer || built?.dxfLayerOf || null, labelOf: pickLabel });
  return { text, perValue, picks };
}
