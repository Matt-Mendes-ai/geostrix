// TASKS.csv #414 — UI-thread side of solid import: parse the file in solidImport.worker.js so a large pit
// shell / stope DXF (hundreds of MB, a million faces) never freezes the app. Kept apart from solidImport.js
// because the worker itself imports that file.
//
// If a worker can't be started at all (it fails before sending anything), the same streaming parser runs on
// the UI thread instead: slower to feel, same result. A parse ERROR from the worker is reported as-is, not
// retried.

export function parseSolidInWorker(file, onProgress) {
  return new Promise((resolve, reject) => {
    let worker, heard = false;
    const fallback = () => import("./solidImport.js").then(({ parseSolidFileStream }) => parseSolidFileStream(file, onProgress)).then(resolve, reject); // #552 — on demand
    try {
      worker = new Worker(new URL("./solidImport.worker.js", import.meta.url), { type: "module" });
    } catch {
      fallback();
      return;
    }
    worker.onmessage = (e) => {
      heard = true;
      const d = e.data;
      if (d.progress) { onProgress?.(d.progress[0], d.progress[1]); return; }
      worker.terminate();
      if (d.error) reject(new Error(d.error));
      else resolve(d.result);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      worker.terminate();
      if (!heard) fallback();
      else reject(new Error(e.message || "The solid import worker stopped unexpectedly."));
    };
    worker.postMessage({ file });
  });
}
