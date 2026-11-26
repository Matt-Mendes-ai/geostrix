// TASKS.csv #4093 (AI app access, batch 5, piece B) — filter_raster: what an AI app may ask of the Raster pane's grid filters (modules/RasterModule.jsx, its own runFilter) and the checks made
// before the pane runs it, in the pane's own terms. Pure: the pane's hook (mcp-filter-run) resolves the raster and the IGRF field, this decides whether it is a filter the pane would run.
//   kinds: the ones that make one new raster by the generic path (derivatives, continuation, tilt, analytic signal, the three field reductions); the depth estimates, worms, Euler and the
//   spectrum are the pane's own tools for a person.
import { rasterMethodOf, filterBlockedBy, fieldFilterNeedsMethod } from "./rasterMethod.js";
import { SURVEY_METHODS } from "./geophysSurveys.js";

export const FILTER_KINDS = ["vd1", "as", "tilt", "upward", "rtp", "rtpa", "rte"];
const FIELD_KINDS = new Set(["rtp", "rtpa", "rte"]);
const fail = (error) => ({ ok: false, error });
const lower = (v) => String(v ?? "").trim().toLowerCase();

// the raster the call names: its id, or its name (exactly, then the only one that contains it)
export function pickRaster(rasters, which) {
  const w = lower(which);
  if (!w) return { error: "Say which raster: its id or name (list_rasters_surveys lists them)." };
  const grids = (rasters || []).filter((r) => r.grid);
  const exact = grids.find((r) => lower(r.id) === w) || grids.find((r) => lower(r.name) === w);
  if (exact) return { raster: exact };
  const part = grids.filter((r) => lower(r.name).includes(w));
  if (part.length === 1) return { raster: part[0] };
  if (part.length > 1) return { error: `More than one raster matches '${String(which).slice(0, 60)}': ${part.slice(0, 6).map((r) => `'${String(r.name).slice(0, 60)}'`).join(", ")}. Use the id.` };
  const picture = (rasters || []).find((r) => !r.grid && (lower(r.id) === w || lower(r.name) === w));
  return { error: picture ? `'${String(picture.name).slice(0, 60)}' is a picture (an image), not a grid with values: filters need a gridded survey or an imported grid.` : `No raster '${String(which).slice(0, 60)}' with grid values in this project. list_rasters_surveys lists them.` };
}

// -> { ok, filt, needsField } | { ok: false, error }. filt is the pane's own filter state for the run; needsField: RTP-type and neither I and D nor a date were given (the hook says so or fills from IGRF when it has a date)
export function filterPlan(raster, surveys, a = {}) {
  const kind = lower(a.filter);
  if (!FILTER_KINDS.includes(kind)) return fail(`Unknown filter '${String(a.filter ?? "").slice(0, 24)}'. They are ${FILTER_KINDS.join(", ")} (vd1 first vertical derivative, as analytic signal, tilt, upward continuation, rtp / rtpa / rte field reductions).`);
  const method = rasterMethodOf(raster, surveys);
  const blocked = filterBlockedBy(kind, method);
  if (blocked === "potential") return fail(`The map filters are for magnetic and gravity grids; '${String(raster.name).slice(0, 60)}' is ${SURVEY_METHODS[method]?.label || "another kind of survey"}.`);
  if (blocked === "magnetic") return fail("Reduction to the pole or equator needs a magnetic grid; this one is gravity. Derivatives, continuation, tilt and analytic signal work on it.");
  if (!method && fieldFilterNeedsMethod(kind)) return fail("This grid's survey method is not set, and a field reduction would assume it is magnetic: set 'This grid is' on its card in Maps first.");
  const filt = { kind, inclination: "", declination: "", height: "", amplitudeInclination: "", integrate: false, si: "1", window: "", date: "", igrfSource: null };
  if (kind === "upward") {
    if (!(Number(a.height) > 0)) return fail("Upward continuation needs 'height': how many metres to continue upward (more than 0).");
    filt.height = String(Number(a.height));
  }
  let needsField = false;
  if (FIELD_KINDS.has(kind)) {
    const hasI = a.inclination != null, hasD = a.declination != null;
    if (hasI !== hasD) return fail("Give both 'inclination' and 'declination' (degrees, declination to true north), or neither with a survey 'date' (YYYY-MM-DD) for IGRF-14.");
    if (hasI) {
      if (!(Math.abs(Number(a.inclination)) <= 90) || !(Math.abs(Number(a.declination)) <= 180)) return fail("The field's inclination is within ±90° and its declination within ±180° (true north).");
      filt.inclination = String(Number(a.inclination)); filt.declination = String(Number(a.declination));
    } else if (a.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) return fail("'date' is the survey date as YYYY-MM-DD.");
      filt.date = String(a.date); needsField = true;
    } else return fail("A field reduction needs the survey's field: 'inclination' and 'declination' (from the survey report), or the survey 'date' (YYYY-MM-DD) to compute them from IGRF-14.");
  }
  return { ok: true, filt, needsField };
}
