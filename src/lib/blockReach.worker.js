// TASKS.csv #1579 — the Grade estimation dialog's reach counts and cell-fit searches, off the main thread (lib/blockReach.js reachSummary)
import { reachSummary } from "./blockReach.js";
import { reachArgsWithSolid } from "./reachSolid.js"; // TASKS.csv #2422 — a restricting solid: the trace parts inside it (its mesh query kept between requests)

self.onmessage = (e) => {
  const { id, args } = e.data;
  try { self.postMessage({ id, result: reachSummary(reachArgsWithSolid(args)) }); } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
