// TASKS.csv #3105 — compositing a whole field in slices of holes, so the window paints between them. compositeDownhole on WA iron's 147,891
// assays was one main-thread task of about 0.6 s at the start of every Estimation run. Composites never span two holes, so the holes are
// composited a batch at a time, in the order compositeDownhole sorts its output (hole id, then depth): each batch comes back sorted and the
// batches concatenate to exactly the one-call result, with no second sort. opts as compositeDownhole's; opts.stats is summed over the
// batches; a domain log is handed to each batch for its own holes only.
import { compositeDownhole } from "./geochem.js";

const holeOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // compositeDownhole's own comparison of hole ids
const nextTask = () => new Promise((r) => setTimeout(r, 0));

export async function compositeDownholeSliced(assays, symbol, unit, elementUnits, opts = {}, { rowsPerSlice = 20000, yieldFn = nextTask, signal = null } = {}) {
  const byHole = new Map();
  for (const a of assays || []) { if (a?.hole_id == null) continue; let l = byHole.get(a.hole_id); if (!l) byHole.set(a.hole_id, (l = [])); l.push(a); }
  const holes = [...byHole.keys()].sort(holeOrder);
  let domByHole = null;
  if (opts.domainRows) { domByHole = new Map(); for (const d of opts.domainRows) { if (d?.hole_id == null) continue; let l = domByHole.get(d.hole_id); if (!l) domByHole.set(d.hole_id, (l = [])); l.push(d); } }
  const stats = opts.stats || null;
  if (stats) { stats.readings = 0; stats.leftOut = 0; }
  const out = [];
  let batch = [], batchHoles = [];
  const flush = () => {
    const st = stats ? {} : null;
    const part = compositeDownhole(batch, symbol, unit, elementUnits, {
      ...opts,
      ...(domByHole ? { domainRows: batchHoles.flatMap((h) => domByHole.get(h) || []) } : {}),
      stats: st || undefined,
    });
    for (const c of part) out.push(c);
    if (st) { stats.readings += st.readings || 0; stats.leftOut += st.leftOut || 0; }
    batch = []; batchHoles = [];
  };
  for (let i = 0; i < holes.length; i++) {
    const rows = byHole.get(holes[i]);
    for (const r of rows) batch.push(r);
    batchHoles.push(holes[i]);
    if (batch.length >= rowsPerSlice && i < holes.length - 1) {
      flush();
      await yieldFn();
      if (signal?.aborted) throw Object.assign(new Error("Cancelled."), { cancelled: true });
    }
  }
  if (batch.length || !out.length) flush();
  return out;
}
