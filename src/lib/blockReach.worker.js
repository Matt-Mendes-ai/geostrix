// TASKS.csv #1579 — the Grade estimation dialog's reach counts and cell-fit searches, off the main thread (lib/blockReach.js reachSummary)
import { reachSummary } from "./blockReach.js";

self.onmessage = (e) => {
  const { id, args } = e.data;
  try { self.postMessage({ id, result: reachSummary(args) }); } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
