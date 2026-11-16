// TASKS.csv #3803 — the Inversion pane's survey checks off the main thread (lib/surveyChecks.js)
import { surveyChecks } from "./surveyChecks.js";

self.onmessage = (e) => {
  const { id, packed, terrain, collars } = e.data || {};
  try { self.postMessage({ id, result: surveyChecks(packed, terrain, collars) }); } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
