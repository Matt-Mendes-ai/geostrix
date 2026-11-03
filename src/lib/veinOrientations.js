// TASKS.csv #1415 (review #1352, Silvertip) — the vein tool asked for a typed dip when its intercepts were in one hole, while the
// project held hundreds of oriented-core Vein / Veinlet / Stringer measurements (dip and dip direction from alpha / beta and the
// survey, #427). The logged orientations at the intercepts — same hole, within `tolM` of the interval — of a vein-like type
// (or the vein's own code), averaged as poles (fisherStats, the Stereonet's mean): the attitude when the intercept midpoints
// cannot fix one, and a check beside a fitted plane when they can.
import { fisherStats } from "./stereonet.js";

export const VEIN_TYPE_RE = /vein|stringer|stockwork|stwk|vnlt|dyke|dike|\bvn\b|\bqv\b/i;
export const VEIN_PICK_TOL_M = 2;

const num = (v) => (v == null || v === "" ? NaN : Number(v));

// intercepts: [{ holeId, from, to }]; structures: the structure layer's rows ({ hole_id, depth, value, dip, azimuth })
// -> { n, holes, picks, meanDip, meanDipDir, k, alpha95, noPreferred, types, tolM } (n 0: nothing found; k null for one pick)
export function loggedVeinAttitude(intercepts, structures, { tolM = VEIN_PICK_TOL_M, veinValue = null } = {}) {
  const byHole = new Map();
  for (const i of intercepts || []) { if (!byHole.has(i.holeId)) byHole.set(i.holeId, []); byHole.get(i.holeId).push(i); }
  const own = veinValue == null ? null : String(veinValue).toUpperCase();
  const picks = (structures || []).filter((s) => {
    const d = num(s.depth), dip = num(s.dip), az = num(s.azimuth);
    if (!Number.isFinite(d) || !Number.isFinite(dip) || !Number.isFinite(az)) return false;
    const type = String(s.value ?? "");
    if (!VEIN_TYPE_RE.test(type) && type.toUpperCase() !== own) return false;
    return (byHole.get(s.hole_id) || []).some((i) => d >= Number(i.from) - tolM && d <= Number(i.to) + tolM);
  }).map((s) => ({ ...s, dip: num(s.dip), azimuth: num(s.azimuth) }));
  if (!picks.length) return { n: 0, holes: 0, picks: [], tolM };
  const holes = new Set(picks.map((p) => p.hole_id)).size;
  const types = [...new Set(picks.map((p) => String(p.value)))];
  if (picks.length === 1) return { n: 1, holes, picks, meanDip: picks[0].dip, meanDipDir: picks[0].azimuth, k: null, alpha95: null, noPreferred: false, types, tolM };
  const fs = fisherStats(picks);
  return { n: picks.length, holes, picks, meanDip: fs.meanDip, meanDipDir: fs.meanDipDir, k: fs.k, alpha95: fs.alpha95, noPreferred: !!fs.noPreferred, types, tolM };
}
