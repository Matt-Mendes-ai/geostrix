// TASKS.csv #1993 (drillhole step) — UI side of the .geoh5 writer worker (geoh5Write.worker.js): one worker per export, ended when it answers. Without a worker (no Worker, or a
// start failure) the same writer runs here, as before: the result is identical, only slower to feel.
import { writeGeoh5 } from "./geoh5Write.js"; // the HDF5 library is imported on demand inside

export function writeGeoh5Async(elements, opts = {}) {
  if (typeof Worker === "undefined") return writeGeoh5(elements, opts);
  return new Promise((resolve, reject) => {
    let w = null;
    try { w = new Worker(new URL("./geoh5Write.worker.js", import.meta.url), { type: "module" }); } catch { resolve(writeGeoh5(elements, opts)); return; }
    const done = () => { try { w.terminate(); } catch { /* ended */ } };
    w.onmessage = (e) => { done(); if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.res); };
    w.onerror = (e) => { e.preventDefault?.(); done(); writeGeoh5(elements, opts).then(resolve, reject); }; // the worker could not run: here
    w.postMessage({ id: 1, elements, opts });
  });
}
