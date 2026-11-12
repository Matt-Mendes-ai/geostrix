// TASKS.csv #2258 — UI side of the Undrilled zones worker (the stopeOutlinesClient pattern). args: undrilledZones' own, without groundAt;
// ground: { terrain } (its grid fields only) or { collars: [{ x, y, z }] } or null. -> { promise, cancel }; a cancelled run resolves { cancelled: true }.
export function runUndrilledZonesAsync(args, ground = null) {
  let worker = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    worker = new Worker(new URL("./undrilledZones.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { worker.terminate(); if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.result); };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || "worker failed")); };
    const t = ground?.terrain;
    const g = t ? { terrain: { bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask } } : ground?.collars ? { collars: ground.collars.map((c) => ({ x: c.x, y: c.y, z: c.z })) } : null;
    worker.postMessage({ args, ground: g });
  });
  return { promise, cancel: () => { worker?.terminate(); settle?.({ cancelled: true }); } };
}
