// TASKS.csv #2846 — UI side of the survey-gridding worker (lib/surveyGrid.worker.js). If no worker can start, the same code runs here.
// -> { promise (the gridSurvey result), cancel() (stops the worker; the promise then resolves { cancelled: true }) }
import { gridSurvey } from "./surveyGrid.js";

export function gridSurveyAsync(pts, opts) {
  let w = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    const here = () => { try { resolve(gridSurvey(pts, opts)); } catch (e) { reject(e); } };
    try { w = new Worker(new URL("./surveyGrid.worker.js", import.meta.url), { type: "module" }); } catch { here(); return; }
    w.onmessage = (e) => { w.terminate(); w = null; if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data); };
    w.onerror = (e) => { e.preventDefault?.(); w?.terminate(); w = null; here(); };
    w.postMessage({ pts: pts.map((r) => ({ x: r.x, y: r.y, value: r.value })), opts });
  });
  return { promise, cancel: () => { if (w) { w.terminate(); w = null; settle?.({ cancelled: true }); } } };
}
