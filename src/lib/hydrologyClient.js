// TASKS.csv #845 — UI side of the terrain-routing worker. The result is cached per terrain object (routing depends only
// on the grid), so changing the sites, the element or the thresholds never routes again. If no worker can start, the
// same code runs here instead.
import { routeTerrain, noDataBits } from "./hydrology.js";

const cache = new WeakMap();
export function routeTerrainAsync(terrain) {
  if (cache.has(terrain)) return cache.get(terrain);
  const p = new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL("./hydrology.worker.js", import.meta.url), { type: "module" }); } catch { try { resolve(routeTerrain(terrain)); } catch (e) { reject(e); } return; }
    w.onmessage = (e) => { w.terminate(); if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data); };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); try { resolve(routeTerrain(terrain)); } catch (err) { reject(err); } };
    const t = { bbox: terrain.bbox, gridW: terrain.gridW, gridH: terrain.gridH, elevations: Float32Array.from(terrain.elevations), noDataMask: terrain.noDataMask ? Uint8Array.from(noDataBits(terrain.noDataMask)) : null }; // the bitset's bytes
    w.postMessage({ id: 1, terrain: t }, [t.elevations.buffer, ...(t.noDataMask ? [t.noDataMask.buffer] : [])]);
  });
  cache.set(terrain, p);
  p.catch(() => cache.delete(terrain));
  return p;
}
