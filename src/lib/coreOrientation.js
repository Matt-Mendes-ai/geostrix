// TASKS.csv — "we need to find a way to calculate the beta angle for non-oriented drilling based on
// field structural measurements." Implements the standard "alpha-beta method" for recovering a
// structural pick's TRUE dip/dip-direction from non-oriented core: alpha (the acute angle between the
// core axis and the structure) is directly measurable on core regardless of rotation, but beta (the
// structure's rotational position around the core) is only measurable relative to an arbitrary scribed
// line, not a true reference. If a SECOND structure with an independently-known true attitude (a
// field/outcrop measurement) is ALSO measured (alpha+beta, against that same arbitrary line) on the same
// core run, that pair lets you solve for the core's unknown rotational offset, which then recovers the
// unknown structure's true attitude too. Every formula here was derived and numerically verified first
// (round-trip forward/inverse across several oblique cases, degenerate vertical-hole and lies-in-plane
// cases, and a full simulated non-oriented calibration workflow that exactly recovers a planted "true"
// attitude) before this file was written — see CoreOrientationCalculator.jsx's own verification notes.
//
// Coordinate frame throughout: East (x), North (y), Up (z) — right-handed (E x N = Up). All angles in
// degrees. "Dip" (both a hole's inclination and a plane's dip) is degrees BELOW horizontal, 0-90 — the
// same convention `survey` rows already use (see desurvey.js), so nothing here needs sign-flipping
// against the rest of the app's own drillhole data.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

// Downhole unit vector from hole azimuth (deg from North, clockwise) and dip-below-horizontal (0-90).
export function holeDirection(az, dip) {
  const a = az * D2R, d = dip * D2R;
  return [Math.sin(a) * Math.cos(d), Math.cos(a) * Math.cos(d), -Math.sin(d)];
}

// Plane pole (unit normal) from dip-direction (deg from North, clockwise) and dip (0-90).
export function poleFromDipDD(dipDirDeg, dipDeg) {
  const a = dipDirDeg * D2R, d = dipDeg * D2R;
  return [-Math.sin(a) * Math.sin(d), -Math.cos(a) * Math.sin(d), Math.cos(d)];
}

// Dip/dip-direction (deg) from a pole (unit vector, either sign — a plane's pole has no fixed sign).
export function dipDDFromPole(poleIn) {
  let n = poleIn;
  if (n[2] < 0) n = scale(n, -1); // canonical: pole's Up component >= 0
  const dipDeg = Math.acos(Math.min(1, Math.max(-1, n[2]))) * R2D;
  if (dipDeg < 1e-6) return { dipDeg: 0, dipDirDeg: 0 }; // flat — dip-direction is genuinely undefined
  let dd = Math.atan2(-n[0], -n[1]) * R2D;
  if (dd < 0) dd += 360;
  return { dipDeg, dipDirDeg: dd };
}

// The reference line scribed on non-oriented core, perpendicular to the hole axis, pointing toward the
// core's "low side" (bottom-of-hole, the default — the line that naturally stays in contact with the
// core tray) or "high side" (top-of-hole) if useTop is true. Undefined (returns null) for a hole within
// ~5deg of vertical: with no meaningful horizontal component, gravity can't define this line any more
// than a real core-orientation tool could on such a hole — a genuine physical limitation to surface in
// the UI, not an edge case to paper over with an arbitrary direction.
export function referenceLine(holeDir, useTop = false) {
  const vertical = [0, 0, useTop ? 1 : -1];
  const vDotD = dot(vertical, holeDir);
  if (1 - Math.abs(vDotD) < 1e-3) return null; // ~ within 2.5 deg of vertical
  return norm(sub(vertical, scale(holeDir, vDotD)));
}

// Forward: true pole -> {alphaDeg (0-90), betaDeg (0-360, clockwise looking down-hole from refLine)}.
// betaDeg is null when alpha is ~90 (core-perpendicular plane => circular intersection, no defined beta).
export function alphaBetaFromPole(pole, holeDir, refLine) {
  const t = cross(holeDir, refLine);
  let n = pole;
  if (dot(n, holeDir) < 0) n = scale(n, -1); // canonical sign so alpha lands in [0,90]
  const sinA = Math.max(-1, Math.min(1, dot(n, holeDir)));
  const alphaDeg = Math.asin(sinA) * R2D;
  const cosA = Math.cos(alphaDeg * D2R);
  if (cosA < 1e-6) return { alphaDeg, betaDeg: null };
  const m = scale(sub(scale(holeDir, sinA), n), 1 / cosA);
  let betaDeg = Math.atan2(dot(m, t), dot(m, refLine)) * R2D;
  if (betaDeg < 0) betaDeg += 360;
  return { alphaDeg, betaDeg };
}

// Inverse: alpha/beta (measured against the TRUE refLine) -> true pole.
export function poleFromAlphaBeta(alphaDeg, betaDeg, holeDir, refLine) {
  const t = cross(holeDir, refLine);
  const a = alphaDeg * D2R, b = betaDeg * D2R;
  const m = add(scale(refLine, Math.cos(b)), scale(t, Math.sin(b)));
  return sub(scale(holeDir, Math.sin(a)), scale(m, Math.cos(a)));
}

// The actual calculator: given the hole's true direction/reference line, a reference structure's
// INDEPENDENTLY KNOWN true attitude (knownDipDirDeg/knownDipDeg, from a field/outcrop measurement) plus
// its alpha/beta AS MEASURED ON THIS NON-ORIENTED CORE (refAlphaDeg/refBetaDeg, against whatever
// arbitrary scribed line the geologist used), and an unknown structure's alpha/beta measured against
// that SAME arbitrary line, solves for the core's unknown rotational offset and returns the unknown
// structure's true dip/dip-direction.
export function solveUnoriented({ holeDir, refLine, knownDipDirDeg, knownDipDeg, refAlphaDeg, refBetaDeg, unkAlphaDeg, unkBetaDeg }) {
  const knownPole = poleFromDipDD(knownDipDirDeg, knownDipDeg);
  const calcRef = alphaBetaFromPole(knownPole, holeDir, refLine);
  const alphaDiscrepancyDeg = Math.abs(calcRef.alphaDeg - refAlphaDeg);
  const refNearPerpendicular = calcRef.alphaDeg > 85 || refAlphaDeg > 85;
  const unkNearPerpendicular = unkAlphaDeg > 85;
  if (calcRef.betaDeg == null || refBetaDeg == null || unkBetaDeg == null) {
    return { ok: false, reason: "One of the reference/unknown structures is ~perpendicular to the hole axis — its intersection with the core is a circle, so beta (and therefore the true orientation) can't be recovered from it." };
  }
  let gammaDeg = calcRef.betaDeg - refBetaDeg;
  gammaDeg = ((gammaDeg % 360) + 360) % 360;
  let unkBetaTrueDeg = unkBetaDeg + gammaDeg;
  unkBetaTrueDeg = ((unkBetaTrueDeg % 360) + 360) % 360;
  const unkPole = poleFromAlphaBeta(unkAlphaDeg, unkBetaTrueDeg, holeDir, refLine);
  const { dipDeg, dipDirDeg } = dipDDFromPole(unkPole);
  return { ok: true, dipDeg, dipDirDeg, alphaDiscrepancyDeg, gammaDeg, refNearPerpendicular, unkNearPerpendicular };
}
