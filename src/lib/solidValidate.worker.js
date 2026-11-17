// TASKS.csv #3791 — a solid's validity check (lib/meshValidate.js validateSolid: edges, defects and the self-intersection test, 0.2 s on a 15,000-face grade shell,
// several on a big one) off the main thread: the estimate restricted to a shell froze the window at its start.
import { validateSolid } from "./meshValidate.js";
self.onmessage = (e) => {
  const { id, positions, indices } = e.data;
  try { self.postMessage({ id, result: validateSolid(positions, indices) }); } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
