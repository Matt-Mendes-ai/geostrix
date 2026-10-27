// TASKS.csv #865 — UI-thread side of the explicit surface fit (explicitSurface.worker.js), on the meshLodClient.js
// pattern: one shared worker, requests answered by id. The language dictionary and the terrain grid are sent only when
// they change. If no worker can start, the same fit runs here instead: slower to feel, same result.
import { currentLanguage, currentDictionary } from "./i18n.js";

let worker = null, seq = 0, sentLang = null, sentTerrain = null;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./explicitSurface.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.failed) w.reject(new Error(e.data.failed)); else w.resolve(e.data.res);
  };
  worker.onerror = (e) => { e.preventDefault?.(); for (const w of waiting.values()) w.reject(new Error(e.message || "explicit surface worker stopped")); waiting.clear(); worker = null; sentLang = null; sentTerrain = null; };
  return worker;
}

// points: [{ x, y, z, ... }]; opts: fitExplicitSurface's options without groundAt; terrain: the project terrain to cut at
// (or null). Resolves with fitExplicitSurface's result; rejects with its Error (already in the interface language).
export function fitExplicitSurfaceAsync(points, opts, terrain) {
  const plain = points.map(({ x, y, z, src, ref, dir, hole, md }) => ({ x, y, z, src, ref, dir, hole, md }));
  try {
    const w = getWorker(), id = ++seq;
    const lang = currentLanguage();
    if (sentLang !== lang) { w.postMessage({ type: "lang", code: lang, dict: currentDictionary() }); sentLang = lang; }
    if (terrain && sentTerrain !== terrain) { w.postMessage({ type: "terrain", terrain: { bbox: terrain.bbox, gridW: terrain.gridW, gridH: terrain.gridH, elevations: terrain.elevations } }); sentTerrain = terrain; }
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      w.postMessage({ id, points: plain, opts, cut: !!terrain });
    });
  } catch {
    return Promise.all([import("./explicitSurface.js"), import("./viewer/geomath.js")]).then(([{ fitExplicitSurface }, { terrainGroundAt }]) => {
      const groundAt = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null; // TASKS.csv #927
      return fitExplicitSurface(points, { ...opts, groundAt });
    });
  }
}
