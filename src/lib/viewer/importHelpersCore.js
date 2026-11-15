// TASKS.csv #3590 (startup trim) — the few helpers of importHelpers.js the 3D View itself uses at startup (shapefile part grouping, the lazy GeoPackage
// loader, the import's skip reasons, an interval's code list), moved here verbatim. importHelpers.js is mostly the import pipeline's: a module the startup
// chunk loads carries every name a lazy module imports from it, so the whole of it was in the startup bundle. importHelpers.js re-exports these names.
import { t as tr } from "../i18n.js"; // TASKS.csv #786 — messages in the interface language

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

// TASKS.csv #439 — gpkg.js (and with it sql.js) is loaded on first GeoPackage import/export, not at
// startup: it was pulling sql.js into the eagerly-loaded bundle for a feature most sessions never touch.
export const loadGpkg = () => import("../gpkg.js");

export const SKIP_REASONS = { // exported: #2493 (Data QC names the reasons the import left rows out)
  "no hole id": () => tr("no hole id"),
  "no depth": () => tr("blank or non-numeric depth"),
  "no from": () => tr("blank or non-numeric From"),
  "no value": () => tr("value not a number"),
  "no code": () => tr("blank code"), // #2182
  "no interval": () => tr("no To and no Depth, so no interval or point to draw"), // #2338
  "reversed": () => tr("To less than From (a reversed interval)"), // #3211
};

// TASKS.csv #1650 — an interval's codes, first first: its stored list, else read back from all_codes ('PY 1 · CP 0.3' -> PY, CP; a
// project imported before the list existed); [] for a one-code interval
export function codeList(row) {
  if (Array.isArray(row?.codes)) return row.codes;
  if (!row?.all_codes) return [];
  return String(row.all_codes).split(" · ").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}
