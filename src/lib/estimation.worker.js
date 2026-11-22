// TASKS.csv #520 — block-model estimation and the dense grids behind grade shells / alteration envelopes, off the UI
// thread. They used to run as one blocking call (Harry Au, unlimited search: 32.5 s of frozen window; Windows shows
// "Not responding" after ~5 s, no repaint, no autosave, no cancel). Same pattern as solidImport.worker.js: the
// inputs are plain sample points + options; progress is posted once per z-slice (throttled); Cancel terminates
// the worker. A dense grid's typed arrays are transferred, not copied.
import { estimateBlockModel, estimateDenseGrid } from "./estimation.js";
import { columnBuffers } from "./estimationCells.js"; // #661
import { unpackPoints } from "./pointColumns.js"; // TASKS.csv #3008
import { shellPost } from "./viewer/shellPost.js"; // TASKS.csv #3580 (b) — a grade shell's cut, iso-surface and counts here, not in the window

self.onmessage = (e) => {
  const { kind } = e.data || {};
  let opts = e.data?.opts;
  // TASKS.csv #3389 — the unsampled drill points (and each set member's) came as columns
  const po = e.data?.packedOpts;
  if (po?.unsampledPoints) opts = { ...opts, unsampledPoints: unpackPoints(po.unsampledPoints) };
  if (po?.memberUnsampled) opts = { ...opts, members: { ...opts.members, unsampled: po.memberUnsampled.map((u) => (u ? unpackPoints(u) : null)) } };
  const points = e.data?.packed ? unpackPoints(e.data.packed) : e.data?.points; // #3008 — columns from the UI thread
  try {
    let last = 0;
    const onProgress = (fraction) => {
      const now = Date.now();
      if (fraction >= 1 || now - last > 120) { last = now; self.postMessage({ type: "progress", fraction }); }
    };
    if (kind === "dense") {
      const result = estimateDenseGrid(points, { ...opts, onProgress });
      if (opts.post) { // #3580 (b): the mesh and the counts go back, not the grid
        const post = shellPost(result, { ...opts.post, inShellPoints: po?.postIn ? unpackPoints(po.postIn) : [], farPoints: po?.postFar ? unpackPoints(po.postFar) : null });
        const { values: _v, supportCode: _c, supportIndex: _i, ...rest } = result;
        self.postMessage({ type: "done", result: { ...rest, post } }, [post.positions.buffer, post.faces.buffer, post.vertexSupport.buffer, ...(post.inside ? [post.inside.idx.buffer, post.inside.value.buffer] : []) /* #3932 batch 3 */]);
        return;
      }
      const transfer = [result.values?.buffer, result.supportCode?.buffer, result.supportIndex?.buffer].filter(Boolean);
      self.postMessage({ type: "done", result }, transfer);
    } else {
      // TASKS.csv #661 — typed columns, transferred: no object per block here and no structured clone of them
      const result = estimateBlockModel(points, { ...opts, onProgress, columns: true });
      self.postMessage({ type: "done", result }, [...columnBuffers(result.columns), ...(result.carry ? [result.carry.buffer] : [])]); // carry: #3784
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err), ...(err?.weakFit ? { weakFit: err.weakFit } : {}) }); // weakFit: TASKS.csv #3273
  }
};
