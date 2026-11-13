// TASKS.csv #3159 — a planned hole's trace (lift / drift), moved verbatim out of holePlanning.js: the 3D view and the planned-hole
// checks draw planned holes at startup, and importing plannedTrace from holePlanning.js put the targeting solvers in the startup
// bundle. holePlanning.js re-exports these.
import { desurveyHole } from "./desurvey.js"; // TASKS.csv #524 — the deviated planned trace

const norm360 = (a) => ((a % 360) + 360) % 360;

// ---------------------------------------------------------------------------------------------
// TASKS.csv #524 — expected LIFT and DRIFT. A planned hole was a straight line, so pierce points on targets
// at depth were optimistic: Golden Triangle diamond holes commonly lift / drift 1-3°/100 m, and 2°/100 m of
// lift moves the toe of a 600 m -60° hole tens of metres. Per planned hole (user convention, ° per 100 m):
//   lift  > 0 : the hole FLATTENS with depth (dip -60 -> -58 over 100 m at lift 2)
//   drift > 0 : the azimuth turns CLOCKWISE with depth (right-hand drift)
// The trace is built from synthetic survey stations every `step` m through the same minimum-curvature desurvey
// a real hole uses.
// ---------------------------------------------------------------------------------------------
export const hasDeviation = (h) => (Number(h?.lift) || 0) !== 0 || (Number(h?.drift) || 0) !== 0;

// survey rows in desurvey.js's INTERNAL convention (dip positive down) for a planned hole with lift / drift
export function deviationStations(hole, step = 10) {
  const L = Number(hole.length) > 0 ? Number(hole.length) : 300;
  const lift = Number(hole.lift) || 0, drift = Number(hole.drift) || 0;
  const out = [];
  for (let md = 0; md < L + 1e-9; md = Math.min(L, md + step)) {
    const dipUser = Math.min(90, Math.max(-90, hole.dip + (lift * md) / 100)); // flattening = less negative
    out.push({ depth: md, azimuth: norm360(hole.azimuth + (drift * md) / 100), dip: -dipUser });
    if (md >= L) break;
  }
  return out;
}

// The one trace builder for a planned hole (3D view, exports, the targeting tools): straight without deviation —
// exactly the old behaviour — or minimum curvature through the deviation stations.
export function plannedTrace(hole) {
  if (!hasDeviation(hole)) return desurveyHole({ ...hole, dip: -hole.dip }, []);
  return desurveyHole({ ...hole, dip: -hole.dip }, deviationStations(hole), "minimumCurvature");
}
