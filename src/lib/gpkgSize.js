// TASKS.csv #1716 (review #1645, Copley) — a GeoPackage is read whole into memory (sql.js): the 791 MB BC surficial geology file froze the
// window 55 s and took the heap to 2.7 GB before its table list even showed. Over this size it is refused before reading, with what to
// do instead; the same file zipped was already refused at 512 MB, with no advice.
import { t as tr } from "./i18n.js";

export const GPKG_MAX_BYTES = 300 * 1024 * 1024;
export function checkGpkgSize(file) {
  const size = Number(file?.size);
  if (!(size > GPKG_MAX_BYTES)) return;
  throw new Error(tr("{name} is {mb} MB: GeoStrix reads a GeoPackage whole, and one this size would freeze the window for minutes and need several GB of memory. Export just the tables and the area you need (in QGIS: clip to your property, save as a new GeoPackage or shapefile) and import that.", { name: file.name || "This GeoPackage", mb: Math.round(size / 1048576) }));
}
