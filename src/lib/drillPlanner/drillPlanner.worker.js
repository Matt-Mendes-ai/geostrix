// TASKS.csv #3962 (P1) — the drill planner's grade model off the interface thread (drillPlannerClient.js runPlanner).
//   { kind: "fit", points, modelType, searchTrend }            -> the normal-score model (fitGradeModel)
//   { kind: "predict", model, holes: [{ id, trace }], rules, opts } -> { [id]: prediction }, with progress per hole
import { fitGradeModel, predictHole } from "./holePrediction.js";

self.onmessage = (e) => {
  const d = e.data || {};
  try {
    if (d.kind === "fit") { self.postMessage({ type: "done", result: fitGradeModel(d.points, { model: d.modelType, searchTrend: d.searchTrend }) }); return; }
    if (d.kind === "predict") {
      const out = {}, holes = d.holes || [];
      holes.forEach((h, i) => { out[h.id] = predictHole(d.model, h.trace, d.rules, d.opts); self.postMessage({ type: "progress", fraction: (i + 1) / holes.length }); });
      self.postMessage({ type: "done", result: out });
      return;
    }
    self.postMessage({ type: "error", message: `unknown job ${d.kind}` });
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
