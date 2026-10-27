// TASKS.csv #865 — the explicit surface fit off the UI thread: the thin-plate solve is O(N^3) (~0.3 s at 800 points on
// a 2021 laptop, about twice that on a budget one) and ran on every pick, drag release and setting change, freezing the
// 3D view. Same function (explicitSurface.js), so the result is identical. The UI sends the interface language and the
// terrain grid once each (when they change); every fit then carries only the points and options.
import { fitExplicitSurface } from "./explicitSurface.js";
import { terrainGroundAt } from "./viewer/geomath.js";
import { useDictionary as setDictionary } from "./i18n.js"; // not a React hook: it only sets the module's dictionary

let terrain = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "lang") { setDictionary(m.code, m.dict); return; }
  if (m.type === "terrain") { terrain = m.terrain; return; }
  const { id, points, opts, cut } = m;
  try {
    const groundAt = cut && terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null; // TASKS.csv #927
    const res = fitExplicitSurface(points, { ...opts, groundAt });
    self.postMessage({ id, res }, [res.positions.buffer, res.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, failed: String(err?.message || err) });
  }
};
