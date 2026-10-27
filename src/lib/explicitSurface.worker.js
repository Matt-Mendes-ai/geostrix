// TASKS.csv #865 — the explicit surface fit off the UI thread: the thin-plate solve is O(N^3) (~0.3 s at 800 points on
// a 2021 laptop, about twice that on a budget one) and ran on every pick, drag release and setting change, freezing the
// 3D view. Same function (explicitSurface.js), so the result is identical. The UI sends the interface language and the
// terrain grid once each (when they change); every fit then carries only the points and options.
import { fitExplicitSurface } from "./explicitSurface.js";
import { terrainGroundAt } from "./viewer/geomath.js";
import { useDictionary as setDictionary } from "./i18n.js"; // not a React hook: it only sets the module's dictionary
import { trimAtFault } from "./explicitTrim.js"; // TASKS.csv #957

let terrain = null, fault = null; // fault: { key, mesh } (world), sent when its geometry changes
// TASKS.csv #957 — fits queued behind a long one are superseded by the newest: each older one is answered `stale` and
// skipped, so after a burst of edits the newest build no longer waits behind every outdated one
const queue = [];
let draining = false;
function drain() {
  draining = false;
  const last = queue.pop();
  for (const m of queue) self.postMessage({ id: m.id, stale: true });
  queue.length = 0;
  if (last) run(last);
}
function run({ id, points, opts, cut, trim }) {
  try {
    const groundAt = cut && terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null; // TASKS.csv #927
    let res = fitExplicitSurface(points, { ...opts, groundAt });
    if (trim) res = fault && fault.key === trim.key ? trimAtFault(res, fault.mesh, trim.side) : { ...res, trim: { missing: true } };
    self.postMessage({ id, res }, [res.positions.buffer, res.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, failed: String(err?.message || err) });
  }
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "lang") { setDictionary(m.code, m.dict); return; }
  if (m.type === "terrain") { terrain = m.terrain; return; }
  if (m.type === "fault") { fault = { key: m.key, mesh: m.mesh }; return; }
  queue.push(m);
  if (!draining) { draining = true; setTimeout(drain, 0); }
};
