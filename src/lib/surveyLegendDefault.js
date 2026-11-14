// TASKS.csv #3323 (review #3195, Galore Creek) — a DC survey's apparent resistivity (10 to 29,634 ohm-m) opened on a linear colour scale:
// everything under about 700 ohm-m, the conductive ground an IP survey is run to find, was one dark colour. Resistivity and
// conductivity are read on a log scale by convention, so a survey of those methods whose 2-98 % range spans at least a decade starts
// its own legend on the log scale (the same stops 'Log' in Colour scale writes). Lazy, with the Geophysics tab: pointSurveyScale
// pulls in inversion.js.
import { SURVEY_METHODS, robustRange } from "./geophysSurveys.js";
import { logViridisStops } from "./pointSurveyScale.js";

export const LOG_SCALE_METHODS = new Set(["res", "mt_rho", "em_cond"]);

// the survey meta an import writes: { method, units } and, for a resistivity or conductivity survey spanning a decade or more, a log legend
export function surveyMetaFor(method, values) {
  const meta = { method, units: SURVEY_METHODS[method]?.units ?? "" };
  if (!LOG_SCALE_METHODS.has(method)) return meta;
  const rr = robustRange(values || []);
  if (rr.min > 0 && rr.max >= 10 * rr.min) meta.legend = { stops: logViridisStops(rr.min, rr.max), colorMode: "continuous" };
  return meta;
}
