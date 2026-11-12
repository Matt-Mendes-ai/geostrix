// TASKS.csv #1579 — the Grade estimation dialog's reach counts and cell-fit searches, off the main thread (lib/blockReach.js reachSummary)
import { reachSummary } from "./blockReach.js";
import { reachArgsWithSolid } from "./reachSolid.js"; // TASKS.csv #2422 — a restricting solid: the trace parts inside it (its mesh query kept between requests)

// TASKS.csv #3007 — the traces come once per traces array (tracesKey) and are kept: copying 6,390 traces cost the main thread 0.35 s on
// every cell or radius change
let keptTraces = null, keptKey = null;
self.onmessage = (e) => {
  const { id, args } = e.data;
  try {
    let a = args;
    if (args?.tracesKey != null) {
      if (args.traces) { keptTraces = args.traces; keptKey = args.tracesKey; }
      else if (keptKey === args.tracesKey) a = { ...args, traces: keptTraces };
      else throw new Error("the traces were not sent");
    }
    self.postMessage({ id, result: reachSummary(reachArgsWithSolid(a)) });
  } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
