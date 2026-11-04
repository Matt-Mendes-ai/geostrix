// TASKS.csv #1797 — UI side of the domains worker. Only each sample's values travel (what clrMatrix reads); the result's index is
// into the same list. If no worker can start, the same code runs here instead.
import { geochemDomains } from "./geochemDomains.js";

export function geochemDomainsAsync(samples, symbols, units, { k = 3 } = {}) {
  const slim = samples.map((s) => ({ values: s.values }));
  return new Promise((resolve, reject) => {
    let w;
    const here = () => { try { resolve(geochemDomains(slim, symbols, units, { k })); } catch (e) { reject(e); } };
    try { w = new Worker(new URL("./geochemDomains.worker.js", import.meta.url), { type: "module" }); } catch { here(); return; }
    w.onmessage = (e) => { w.terminate(); if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.result); };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); here(); };
    w.postMessage({ id: 1, samples: slim, symbols, units, k });
  });
}
