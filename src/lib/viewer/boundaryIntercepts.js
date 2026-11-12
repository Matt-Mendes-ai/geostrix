// TASKS.csv #84 / #2931 — the Boundary intercepts table (Contact picks): the upper contact of every litho, alteration and vein interval
// that starts a unit, placed on its hole's desurveyed trace, in real-world E / N / Z. Moved out of modules/viewer/useModelling.js
// (computeIntercepts) for #2931: on the WA iron project (6,390 holes, 150,455 strand intervals) it froze the dialog's opening
// 9-12.6 s because every interval looked its hole up with traces.find; it now uses traceOfHole / traceAtOf (modelHelpers.js).
// sceneToApi(p) -> origin-relative { x: E, y: N, z: elevation }; origin adds the scene origin back (#232).
import { intervalEndIndex, intervalStartIndex, upperContactOf } from "./intervals.js";
import { interceptId, traceAtOf, traceOfHole } from "./modelHelpers.js";

export function boundaryIntercepts(layers, traces, o, sceneToApi) {
  const out = [];
  // TASKS.csv #52 (c) — the VEIN layer is listed here too now. #84's exclusions already applied to
  // vein intercepts inside runVeinModel, but the table that exists to review them only ever showed
  // litho and alteration, so a vein pick could be silently excluded by a filter with no UI to see it,
  // and (c)'s named sets could not have contained one at all. Listing it closes both gaps at once.
  [["litho", "Lithology"], ["alt", "Alteration"], ["vein", "Vein / dyke"]].forEach(([layerKey, layerLabel]) => {
    const ends = intervalEndIndex(layers[layerKey]); // #354 — skip row splits inside one unit
    const starts = intervalStartIndex(layers[layerKey]); // #569 — up-holes: the top is at `to`
    (layers[layerKey] || []).forEach((r) => {
      if (isNaN(r.from)) return;
      const t = traceOfHole(traces, r.hole_id); // #2931 — was traces.find per interval
      if (!t) return;
      const at = traceAtOf(t.pts);
      const top = upperContactOf(r, (md) => at(md)?.y, { startIndex: starts, endIndex: ends, codes: new Set([r.value]) });
      if (top.continues) return;
      const p = at(top.md);
      if (!p) return;
      const api = sceneToApi(p);
      // TASKS.csv #232 — api coords are origin-relative (see sceneToApi's own comment); add the
      // scene origin back in so the table/CSV export shows real-world E/N/Z, matching what the
      // mesh-export path (meshExport.js's sceneVertsToWorld) already does for the same conversion.
      out.push({ id: interceptId(layerKey, r), layerKey, layerLabel, hole_id: r.hole_id, unit: r.value, from: top.md, x: api.x + o.x, y: api.y + o.y, z: api.z + o.z });
    });
  });
  return out;
}
