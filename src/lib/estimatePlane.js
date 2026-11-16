// TASKS.csv #3679 (Fireweed rehearsal round 3, Macpass Tom West) — the block estimate did not get the grade shell's fix (#3655). With the
// dialog's defaults (a 60 m sphere, 2.5 times the sample spacing) Tom West put 16.8 Mm³ / 50.9 Mt at or above 2 % Zn where the same build's
// default shell was 4.6 Mm³; with the trend the Trends panel proposes (the plane of the samples at their 90th percentile) the search became
// 60 x 19 x 11 m (the radius kept as its long axis), 2.8 Mm³, and 383 of the 729 blocks the holes pass through stayed empty (#3593).
//
// The estimate now searches as the shell does:
//  - with no structural trend chosen for block estimation and no flat search typed, along the plane of the samples at or above a cut-off
//    (lib/viewer/shellPlane.js shellPlaneSearch, fitted as the Trends panel fits, the ratios capped at 6): the cut-off of the element's
//    grade shell when one is in the model, else the samples' 90th percentile (the Grade shell pane's and the Trends panel's proposal);
//  - whenever the search is an ellipsoid the user did not size (that plane, or a chosen trend with the radius the dialog proposed), its long
//    axis is the one that keeps the VOLUME of the proposed sphere (sameVolumeMajorM: Tom West's 60 m -> 134 x 72 x 22 m), not the
//    sphere's radius (60 x 19 x 11 m, a fifth of it, thinner than the 24 m between the holes' samples).
import { shellPlaneSearch } from "./viewer/shellPlane.js";
import { solidChoices } from "./solidChoices.js";

const r1 = (v) => Math.round(v * 10) / 10;

// a : b : c = max : int : min with a * b * c = R³ -> a
export function sameVolumeMajorM(radiusM, ratios) {
  const max = Number(ratios?.max), int = Number(ratios?.int), min = Number(ratios?.min) || 1;
  if (!(radiusM > 0) || !(max > 0) || !(int > 0)) return radiusM;
  return (radiusM * max) / Math.cbrt(max * int * min);
}

// The newest CLOSED grade shell of the element among the modelled volumes (lib/viewer/estimationShells.js closedShellsOf: { id, name,
// params: { tool, element, cutoff } }), -> { id, name, cutoff } | null
export function gradeShellOf(volumeShells, symbol) {
  const cands = (volumeShells || []).filter((v) => v?.params?.tool === "numeric grade shell" && v.params.element === symbol && Number.isFinite(v.params.cutoff));
  if (!cands.length) return null;
  const closed = new Map(solidChoices(cands).closed.map((v) => [v.id, v.volumeM3]));
  for (let i = cands.length - 1; i >= 0; i--) if (closed.has(cands[i].id)) return { id: cands[i].id, name: cands[i].name, cutoff: cands[i].params.cutoff, volumeM3: closed.get(cands[i].id) };
  return null;
}

// The cut-off whose samples give the plane: the grade shell's, else the 90th percentile of the positive values
export function planeCutoff(points, shell) {
  if (shell && Number.isFinite(shell.cutoff)) return { value: shell.cutoff, from: "shell", name: shell.name };
  const v = (points || []).map((p) => p?.value).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return { value: +v[Math.floor(0.9 * (v.length - 1))].toPrecision(3), from: "p90", n: v.length };
}

// points: the samples ({ x, y, z, hole_id, value }); -> null (keep the sphere) or { trend, cutoff, n, holes, leftOut, drilling }
// TASKS.csv #3782 — tested against all the samples, grade ignored (lib/drillingPlane.js): the shape of the drilling -> { trend: null, drilling,
// rejected: { dip, dipAzimuth } } and the search stays the sphere
// The trend's ratios only: the dialog sizes the ellipsoid from its radius (sameVolumeMajorM).
export function estimatePlane(points, shell = null) {
  const cut = planeCutoff(points, shell);
  if (!cut) return null;
  const at = (points || []).filter((p) => p?.value >= cut.value);
  const pl = shellPlaneSearch(at, 1, { allPts: points });
  if (!pl) return { trend: null, cutoff: cut, n: at.length, holes: new Set(at.map((p) => p.hole_id)).size };
  if (!pl.trend) return { trend: null, cutoff: cut, n: pl.n, holes: pl.holes, drilling: pl.drilling, rejected: pl.rejected };
  return { trend: pl.trend, cutoff: cut, n: pl.n, holes: pl.holes, leftOut: pl.leftOut, drilling: pl.drilling };
}

// The ellipsoid's three axes for a long axis
export const ellipsoidAxesM = (majorM, ratios) => [majorM, (majorM * ratios.int) / ratios.max, (majorM * ratios.min) / ratios.max].map(r1);
