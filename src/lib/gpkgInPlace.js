// TASKS.csv #1716 (review #1645, Copley) — a big GeoPackage is no longer read whole: the desktop app opens it in the main process
// (electron/gpkgReader.js), lists its feature tables with their extents, and reads from each only the features inside the project
// area through the table's R-tree index. The 791 MB BC surficial geology file read whole froze the window 55 s and took the heap to
// 2.7 GB; read this way, a project's area comes back in well under a second.
import { epsgBySrsRows, layerFromRows } from "./gpkg.js";
import { getProj4Def, projectedBounds } from "./reproject.js";
import { gpkgIndex, gpkgRead } from "./desktop.js";
import { t as tr } from "./i18n.js";

export const GPKG_IN_PLACE_BYTES = 100 * 1024 * 1024; // over this, a GeoPackage is read in place when the desktop app can
export const GPKG_IN_PLACE_MAX_FEATURES = 100000; // per table, after the area filter

const meets = (a, b) => a[2] >= b[0] && a[0] <= b[2] && a[3] >= b[1] && a[1] <= b[3];

// clipBox [xmin, ymin, xmax, ymax] in the project CRS, as the table's CRS sees it (the extent of points along its edges, #559). Same
// CRS, or a CRS GeoStrix cannot reproject: the box as it is (buildLayer then assumes the file is in the project CRS, and says so).
export async function boxInTableCrs(clipBox, projectEpsg, tableEpsg) {
  const src = Number(projectEpsg), dst = Number(tableEpsg);
  if (!(src > 0) || !(dst > 0) || src === dst) return clipBox;
  const [fromDef, toDef] = await Promise.all([getProj4Def(src), getProj4Def(dst)]);
  if (!fromDef || !toDef) return clipBox;
  const b = projectedBounds(fromDef, toDef, ...clipBox);
  return b.every(Number.isFinite) ? b : clipBox;
}

// -> { layers: [layer + inPlace: { kept, total, truncated }], outside: [table names wholly outside the area] }, or null when the file
// cannot be opened in place (not the desktop app, or a File with no path on disk, e.g. one read through the Browser panel): the caller
// then reads it whole as before. sourceEpsg: a Source CRS chosen in the panel, which wins over the file's own (#488).
export async function readGeoPackageNear(file, { clipBox, projectEpsg, sourceEpsg = null, maxFeatures = GPKG_IN_PLACE_MAX_FEATURES, index = gpkgIndex, read = gpkgRead }) {
  const ix = await index(file);
  if (!ix.ok && ix.error === "no path") return null;
  if (!ix.ok) throw new Error(ix.error);
  if (!clipBox) throw new Error(tr("{name} is {mb} MB. GeoStrix reads a GeoPackage this size only around the project's holes and samples, and this project has none yet: import them first, or export just your area from QGIS and import that.", { name: file.name, mb: Math.round(file.size / 1048576) }));
  const epsgBy = epsgBySrsRows((ix.srs || []).map((s) => [s.srs_id, s.organization, s.organization_coordsys_id, s.definition]));
  const layers = [], outside = [];
  for (const t of ix.tables) {
    const epsg = sourceEpsg ? Number(sourceEpsg) : epsgBy[t.srsId];
    const box = await boxInTableCrs(clipBox, projectEpsg, epsg);
    if (t.extent && !meets(t.extent, box)) { outside.push(t.name); continue; } // gpkg_contents says it lies wholly outside
    const r = await read(file, { table: t.name, bbox: box, max: maxFeatures });
    if (!r.ok) throw new Error(`${t.name}: ${r.error}`);
    if (!r.rows.length) { outside.push(t.name); continue; }
    const layer = layerFromRows(t.name, r.columns, r.rows, r.geomCol, epsg);
    layers.push({ ...layer, inPlace: { kept: r.rows.length, total: t.count, truncated: !!r.truncated } });
  }
  return { layers, outside };
}
