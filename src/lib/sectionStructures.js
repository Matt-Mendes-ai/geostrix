// TASKS.csv #1130 — Matt: "structures on cross sections should be drawn as lines pointing towards the dip direction not
// circles, for measurements without a beta we should come up with a most likely trend and then have a 'penumbra-like'
// cone around the measurement indicating other possible orientations".
//
// An alpha-only pick (angle to the core axis, no beta) fixes the plane only up to a rotation about the hole: every
// beta gives a plane at that alpha. Swept over beta, those planes cut the section plane at a FAN of apparent dips.
// The most likely one is the beta whose pole is nearest the mean pole of the oriented picks of the same structure
// type (else of every oriented pick); with no oriented picks it is the middle of the fan. The fan is what the
// section draws faintly around it.
import { holeDirection, referenceLine, poleFromAlphaBeta, poleFromDipDD, dipDDFromPole } from "./coreOrientation.js";

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// apparent dip (deg, signed: + = down towards B) of a plane on a section of azimuth secAz
export function apparentDipOn(dipDeg, dipDirDeg, secAz) {
  return Math.atan(Math.tan(dipDeg * D2R) * Math.cos((dipDirDeg - secAz) * D2R)) * R2D;
}

// mean pole of oriented picks ([{ dip, azimuth }]), poles flipped into one hemisphere; null when none or no fabric
// (|resultant| / n < 0.6 — random planes sit near 0.5 with this flip, see #1066)
export function meanPole(picks) {
  const ps = (picks || []).filter((p) => Number.isFinite(p.dip) && Number.isFinite(p.azimuth)).map((p) => poleFromDipDD(p.azimuth, p.dip));
  if (!ps.length) return null;
  let r = [0, 0, 0];
  for (const v of ps) { const s = v[0] * r[0] + v[1] * r[1] + v[2] * r[2] < 0 ? -1 : 1; r = [r[0] + s * v[0], r[1] + s * v[1], r[2] + s * v[2]]; }
  const len = Math.hypot(r[0], r[1], r[2]);
  if (!(len / ps.length >= 0.6)) return null;
  return r.map((c) => c / len);
}

// alphaDeg, hole direction at the pick (azimuth, dip below horizontal, deg), section azimuth, prior mean pole (or null)
// -> { fan: [apparent dips, one per 10° of beta], likely, likelyFrom: "prior" | "fan" } or null
export function alphaOnlyFan(alphaDeg, holeAzDeg, holeDipDeg, secAz, prior = null, stepDeg = 10) {
  if (![alphaDeg, holeAzDeg, holeDipDeg, secAz].every(Number.isFinite) || alphaDeg < 0 || alphaDeg > 90) return null;
  const hd = holeDirection(holeAzDeg, holeDipDeg);
  const ref = referenceLine(hd) || [1, 0, 0]; // any line across the core: beta is swept through 360° anyway
  const fan = [];
  let best = null, bestDot = -1;
  for (let b = 0; b < 360; b += stepDeg) {
    const pole = poleFromAlphaBeta(alphaDeg, b, hd, ref);
    const { dipDeg, dipDirDeg } = dipDDFromPole(pole);
    const ad = apparentDipOn(dipDeg, dipDirDeg, secAz);
    fan.push(ad);
    if (prior) { const d = Math.abs(pole[0] * prior[0] + pole[1] * prior[1] + pole[2] * prior[2]) / (Math.hypot(...pole) || 1); if (d > bestDot) { bestDot = d; best = ad; } }
  }
  if (best != null) return { fan, likely: best, likelyFrom: "prior" };
  const sorted = fan.slice().sort((a, b) => a - b);
  return { fan, likely: sorted[sorted.length >> 1], likelyFrom: "fan" };
}
