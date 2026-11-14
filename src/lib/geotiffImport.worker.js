// TASKS.csv #3188 — a GeoTIFF read, coloured and encoded off the UI thread, and its picture reprojected there (raster.js geotiffImportWork:
// parseGeoTIFF and reprojectImageRGBA, unchanged). Without an OffscreenCanvas it answers `failed` and the page reads the file itself; a
// file the reader refuses answers `error` with the reader's own message (in the interface language).
import { geotiffImportWork } from "./raster.js";
import { useDictionary as setDictionary } from "./i18n.js"; // not a React hook: it only sets the module's dictionary

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.lang) setDictionary(d.lang.code, d.lang.dict);
  if (typeof OffscreenCanvas === "undefined") { self.postMessage({ id: d.id, failed: "no OffscreenCanvas" }); return; }
  try {
    const { res, transfer } = await geotiffImportWork(d);
    self.postMessage({ id: d.id, res }, transfer);
  } catch (err) {
    self.postMessage({ id: d.id, error: String(err?.message || err) });
  }
};
