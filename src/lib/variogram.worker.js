// TASKS.csv #3009 (WA iron review) — the experimental variogram and the direction table's rows off the main thread: on 147,601 composites
// the pair loop froze the window 4.3-5.4 s downhole and 9.8-12.0 s in a plane, with no progress and no cancel. The composites come once
// per run (columns, lib/pointColumns.js) and are kept for the direction table's 13 rows.
import { experimentalVariogram, directionRow } from "./variogram.js";
import { unpackPoints } from "./pointColumns.js";

let kept = null, keptKey = null;
self.onmessage = (e) => {
  const { id, kind, key, packed, opts, dir, model } = e.data || {};
  try {
    if (packed) { kept = unpackPoints(packed); keptKey = key; }
    if (keptKey !== key || !kept) throw new Error("the composites were not sent");
    const result = kind === "dir" ? directionRow(kept, opts, dir, model) : experimentalVariogram(kept, opts);
    self.postMessage({ id, result });
  } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
