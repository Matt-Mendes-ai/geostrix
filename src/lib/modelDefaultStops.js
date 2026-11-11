// TASKS.csv #2400 (review #2325, WA uranium) — the legend editor's 'Reset to default' after Classify left Style on 'Classified (stepped)' and
// replaced the estimate's own 17-stop log legend with a linear 2-98 % stretch. The default a model goes back to: continuous colours, and, for a
// model on a log scale (#481 / #1780), the log-spaced ramp it was made with: its property's (resistivity red-to-blue, #1788; the sequential
// ramp for other properties) or the grade ramp of estimates (#702). A linear model goes back to the default gradient (no stops). Pure.
import { logStops, gradeStops, SEQUENTIAL_ANCHORS } from "./inversion.js";
import { propertyRamp } from "./voxelProperty.js";

export function defaultModelLegend(model) {
  const out = { colorMode: "continuous", stops: [] };
  if (!model?.logScale || !(model.min > 0) || !(model.max > model.min)) return out;
  if (model.property) return { ...out, stops: logStops(model.min, model.max, propertyRamp(model.property)?.anchors || SEQUENTIAL_ANCHORS) };
  return { ...out, stops: gradeStops(model.min, model.max) };
}
