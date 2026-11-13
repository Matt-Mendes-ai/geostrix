// TASKS.csv #2838 / #2850 (GSC geophysics review) — the FFT grid filters off the UI thread. applyGridFilter (gridFilters.js) froze the window
// 1.1–1.9 s on a 422 x 332 grid and 5–7 s on a 945 x 501 one (mirror padding to >= 2x, then 2D FFTs and, for tilt / analytic signal,
// several operators). Same function, so the result is identical; the UI sends the interface language with each request, so a thrown
// message ('Enter the field inclination…') is still in the user's language.
import { applyGridFilter } from "./gridFilters.js";
import { gridPicture } from "./gridPicture.js"; // TASKS.csv #3033 — the filtered raster's picture made here too
import { bytesToB64 } from "./base64.js";
import { useDictionary as setDictionary } from "./i18n.js"; // not a React hook: it only sets the module's dictionary

// TASKS.csv #3033 — op "picture": the stretch, the colours, the PNG (OffscreenCanvas) and the stored values of a grid, so the last ~0.3-1 s
// of a filter's freeze (rasterFromGrid on the UI thread) goes too
async function picture({ id, values, nx, ny }) {
  const pic = gridPicture(values, nx, ny);
  if (!pic.valid) { self.postMessage({ id, res: { valid: 0 } }); return; }
  const canvas = new OffscreenCanvas(nx, ny);
  canvas.getContext("2d").putImageData(new ImageData(pic.rgba, nx, ny), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const dataUrl = `data:image/png;base64,${bytesToB64(new Uint8Array(await blob.arrayBuffer()))}`;
  self.postMessage({ id, res: { lo: pic.lo, hi: pic.hi, valid: pic.valid, valuesB64: pic.valuesB64, dataUrl } });
}

self.onmessage = (e) => {
  if (e.data?.op === "picture") { picture(e.data).catch((err) => self.postMessage({ id: e.data.id, failed: String(err?.message || err) })); return; }
  const { id, grid, kind, opts, lang } = e.data;
  try {
    if (lang) setDictionary(lang.code, lang.dict);
    const r = applyGridFilter(grid, kind, opts);
    const values = r.values instanceof Float32Array || r.values instanceof Float64Array ? r.values : Float64Array.from(r.values);
    self.postMessage({ id, res: { ...r, values } }, [values.buffer]);
  } catch (err) {
    self.postMessage({ id, failed: String(err?.message || err) });
  }
};
