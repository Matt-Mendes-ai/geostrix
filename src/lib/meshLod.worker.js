// TASKS.csv #795 — simplifies a drawing copy of a big mesh off the UI thread (meshLod.js); the result's index buffer is
// transferred back, the positions copy is dropped here. Static import: workers are bundled as one file (no splitting).
import { MeshoptSimplifier } from "meshoptimizer";
import { simplifyIndexWith } from "./meshLod.js";

self.onmessage = async (e) => {
  const { id, positions, index, targetTris, maxError } = e.data;
  try {
    await MeshoptSimplifier.ready;
    const r = simplifyIndexWith(MeshoptSimplifier, positions, index, { targetTris, maxError });
    self.postMessage({ id, index: r.index, triangles: r.triangles, error: r.error }, [r.index.buffer]);
  } catch (err) {
    self.postMessage({ id, failed: String(err?.message || err) });
  }
};
