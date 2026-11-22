// TASKS.csv #3991 — the piece labelling of a big mesh, off the main thread (meshPiecesClient.js)
import { labelPieces } from "./meshPieces.js";

self.onmessage = (e) => {
  const { id, index, vertexCount } = e.data || {};
  try {
    const r = labelPieces(index, vertexCount);
    self.postMessage({ id, ok: true, result: r }, r ? [r.labels.buffer] : []);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
