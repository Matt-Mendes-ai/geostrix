// TASKS.csv #4034 (#4015 guided modelling, row 4: failure causes; docs/ideas/guided-modelling-design.md section 1, step 4's "If it fails" table) —
// the modelling runs' failure notices carry a `code` and a `detail` (lib/notices.js withCode; their text is unchanged), and the guide's "Next"
// buttons come from here: nextFor(code, detail) -> [{ label, act }], best first. `label` is an existing button label wherever one exists (said
// through tr() by the caller: it is the English key); `act` is { id, ...what it needs }, carried out by the guide card (row 5).
//
// codes and their detail:
//   "singular"          GemPy could not solve (#3986)        { kind, unit, other }   the first risk the input check found (lib/gempyInputCheck.js)
//   "nothing-left"      Nothing left to model (#4024)         { reasons }             lib/modellingNothingLeft.js's reasons ({ kind, label, ..., unit })
//   "order"             order cancelled: holes disagree (#3994) { order }            the unit keys in the order the holes give (youngest first)
//   "limit"             over GemPy's units / faults (#3162)  { overSurfaces, surfaces, maxSurfaces, overFaults, faults, maxFaults, fromMap }
//   "too-few-contacts"  fewer than three contacts (#1189)    { units }               the units behind those surfaces
//   "cover"             the cover starts most holes (#3997)  { unit }
// A unit is its name in the run (the surface "Top of X" is unit X: a logged code, a group's name or a modelling code's name), as the stack lists it.
export const GUIDE_FAILURES = ["singular", "nothing-left", "order", "limit", "too-few-contacts", "cover"];

const leaveOut = (unit) => ({ label: "Leave out of the model", act: { id: "leave-out", unit } }); // #4026's button
const drawInstead = (unit) => ({ label: "Draw it instead", act: { id: "draw-instead", unit: unit || null } }); // the Drawn route (Explicit surface)
const DATA_QC = { label: "Data QC", act: { id: "data-qc" } };

export function nextFor(code, detail = {}) {
  const d = detail || {};
  switch (code) {
    case "singular": // leave out the unit the cause names; else sort by the holes; else draw it
      return d.unit ? [leaveOut(d.unit), drawInstead(d.unit)] : [{ label: "Sort by the holes", act: { id: "sort-by-holes" } }, drawInstead(null)];
    case "nothing-left": {
      const reasons = Array.isArray(d.reasons) ? d.reasons : [];
      const out = [], first = reasons.find((r) => r?.unit);
      if (first) out.push(leaveOut(first.unit));
      if (reasons.some((r) => r?.kind === "invalid" || r?.kind === "suspect")) out.push(DATA_QC); // a column with missing values, or suspect collar elevations
      return out;
    }
    case "order":
      return [{ label: "Use the holes' order", act: { id: "use-holes-order", order: Array.isArray(d.order) ? d.order : [] } }];
    case "limit": {
      const out = [];
      if (d.overSurfaces) out.push(d.fromMap
        ? { label: "Pick the {max} for me", vars: { max: d.maxSurfaces }, act: { id: "pick-map-units", max: d.maxSurfaces } } // #3985, Model from map
        : { label: "Cut down to the {max} with the most logged metres", vars: { max: d.maxSurfaces }, act: { id: "cut-down", max: d.maxSurfaces } }); // Add all's cut (#3999)
      if (d.overFaults) out.push({ label: "Pick the {max} for me", vars: { max: d.maxFaults }, act: { id: "pick-faults", max: d.maxFaults } });
      return out;
    }
    case "too-few-contacts": {
      const units = Array.isArray(d.units) ? d.units : [];
      return [drawInstead(units[0] || null)];
    }
    case "cover":
      return d.unit ? [{ label: "Cover and weathering", act: { id: "cover", unit: d.unit } }] : [];
    default:
      return [];
  }
}
