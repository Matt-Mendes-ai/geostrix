// TASKS.csv #3803 — the Inversion pane's survey checks off the main thread (lib/surveyChecks.js)
import { surveyChecks, pointDefaults } from "./surveyChecks.js";

self.onmessage = (e) => {
  const { id, kind, packed, terrain, collars, opts } = e.data || {};
  try { self.postMessage({ id, result: kind === "points" ? pointDefaults(packed, opts) : surveyChecks(packed, terrain, collars) }); } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); } // "points": TASKS.csv #3883 (#3803)
};
