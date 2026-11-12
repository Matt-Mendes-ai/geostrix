// TASKS.csv #2838 / #2850 (GSC geophysics review) — the FFT grid filters off the UI thread. applyGridFilter (gridFilters.js) froze the window
// 1.1–1.9 s on a 422 x 332 grid and 5–7 s on a 945 x 501 one (mirror padding to >= 2x, then 2D FFTs and, for tilt / analytic signal,
// several operators). Same function, so the result is identical; the UI sends the interface language with each request, so a thrown
// message ('Enter the field inclination…') is still in the user's language.
import { applyGridFilter } from "./gridFilters.js";
import { useDictionary as setDictionary } from "./i18n.js"; // not a React hook: it only sets the module's dictionary

self.onmessage = (e) => {
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
