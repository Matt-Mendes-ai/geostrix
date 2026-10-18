// TASKS.csv #520 — block-model estimation and the dense grids behind grade shells / alteration envelopes, off the UI
// thread. They used to run as one blocking call (Harry Au, unlimited search: 32.5 s of frozen window; Windows shows
// "Not responding" after ~5 s, no repaint, no autosave, no cancel). Same pattern as solidImport.worker.js: the
// inputs are plain sample points + options; progress is posted once per z-slice (throttled); Cancel terminates
// the worker. A dense grid's typed arrays are transferred, not copied.
import { estimateBlockModel, estimateDenseGrid } from "./estimation.js";
import { columnBuffers } from "./estimationCells.js"; // #661

self.onmessage = (e) => {
  const { kind, points, opts } = e.data || {};
  try {
    let last = 0;
    const onProgress = (fraction) => {
      const now = Date.now();
      if (fraction >= 1 || now - last > 120) { last = now; self.postMessage({ type: "progress", fraction }); }
    };
    if (kind === "dense") {
      const result = estimateDenseGrid(points, { ...opts, onProgress });
      const transfer = [result.values?.buffer, result.supportCode?.buffer, result.supportIndex?.buffer].filter(Boolean);
      self.postMessage({ type: "done", result }, transfer);
    } else {
      // TASKS.csv #661 — typed columns, transferred: no object per block here and no structured clone of them
      const result = estimateBlockModel(points, { ...opts, onProgress, columns: true });
      self.postMessage({ type: "done", result }, columnBuffers(result.columns));
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
