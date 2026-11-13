// TASKS.csv #2838 / #2850 (GSC geophysics review) — UI side of the grid-filter worker (gridFilter.worker.js): the FFTs no longer freeze the
// window, so the 'Filtering…' state stays live and the app can be used meanwhile. One worker per request, ended when it answers. If no
// worker can start (or it fails to load), the same function runs here instead, as before.
import { applyGridFilter } from "./gridFilters.js";
import { currentLanguage, currentDictionary, t } from "./i18n.js";

let seq = 0;
// TASKS.csv #3033 — the raster of a grid (rasterFromGrid's record), its picture made in the worker: the stretch, the colours, the PNG and the
// stored values. Resolves to the same record; runs rasterFromGrid here when no worker (or no OffscreenCanvas) is to be had.
export function rasterFromGridAsync(params, { makeWorker } = {}) {
  return new Promise((resolve, reject) => {
    const inline = async () => { try { const { rasterFromGrid } = await import("./raster.js"); resolve(rasterFromGrid(params)); } catch (err) { reject(err); } };
    let w;
    try {
      w = makeWorker ? makeWorker() : new Worker(new URL("./gridFilter.worker.js", import.meta.url), { type: "module" });
    } catch { inline(); return; }
    const id = ++seq;
    w.onmessage = async (e) => {
      if (e.data?.id !== id) return;
      w.terminate();
      if (e.data.failed) { inline(); return; } // no OffscreenCanvas here: the UI thread makes it, as before
      const res = e.data.res;
      try {
        const { rasterRecord } = await import("./raster.js");
        if (!res.valid) { reject(new Error(t("The filter produced no values."))); return; }
        resolve(rasterRecord(params, res, res.dataUrl));
      } catch (err) { reject(err); }
    };
    w.onerror = (e) => { e?.preventDefault?.(); w.terminate(); inline(); };
    const values = Float64Array.from(params.values); // a copy: the caller's array stays usable
    w.postMessage({ op: "picture", id, values, nx: params.nx, ny: params.ny }, [values.buffer]);
  });
}
// grid: { nx, ny, dx, dy, values } (values row 0 = north); resolves to applyGridFilter's result
export function applyGridFilterAsync(grid, kind, opts = {}, { makeWorker } = {}) {
  return new Promise((resolve, reject) => {
    const inline = () => { try { resolve(applyGridFilter(grid, kind, opts)); } catch (err) { reject(err); } };
    let w;
    try {
      w = makeWorker ? makeWorker() : new Worker(new URL("./gridFilter.worker.js", import.meta.url), { type: "module" });
    } catch { inline(); return; }
    const id = ++seq;
    w.onmessage = (e) => {
      if (e.data?.id !== id) return;
      w.terminate();
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.res);
    };
    w.onerror = (e) => { e?.preventDefault?.(); w.terminate(); inline(); }; // the worker could not load: run it here
    const values = Float32Array.from(grid.values); // a copy, so the caller's array stays usable
    w.postMessage({ id, grid: { nx: grid.nx, ny: grid.ny, dx: grid.dx, dy: grid.dy, values }, kind, opts,
      lang: { code: currentLanguage(), dict: currentDictionary() } }, [values.buffer]);
  });
}
