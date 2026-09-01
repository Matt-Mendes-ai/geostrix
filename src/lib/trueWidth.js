// TASKS.csv #230 — true (structure-corrected) width for reported intercepts. Raised independently by
// three of the five specialist audits, and the last substantive open piece of that row: intercept
// reports have always quoted DOWNHOLE length, which overstates real thickness by 1/|cos θ| whenever
// the hole isn't drilled perpendicular to the mineralized structure. That's not a rounding detail —
// a hole cutting a vein at 30° off-perpendicular reports ~15% too thick; at 60° off it reports
// DOUBLE. Quoting downhole width as if it were true width is one of the classic ways a resource
// estimate gets inflated, so this matters for exactly the reporting GeoStrix is used for.
//
// THE FORMULA, and why it's this one:
//   trueWidth = downholeLength × |ĥ · n̂|
// where ĥ is the unit vector along the drillhole through the intercept and n̂ is the unit NORMAL
// (pole) to the mineralized structure. Sanity-checked at both limits before being written:
//   - hole drilled exactly perpendicular to the structure → ĥ is parallel to n̂ → |ĥ·n̂| = 1 →
//     trueWidth == downholeLength (the best case: the hole measures the structure's real thickness).
//   - hole lying exactly IN the plane of the structure → ĥ ⊥ n̂ → |ĥ·n̂| = 0 → trueWidth = 0
//     (a grazing hole "sees" enormous apparent width across essentially no true thickness).
// Equivalently this is downholeLength × sin(acute angle between hole and plane), the form some
// textbooks quote — identical, since the angle to the plane is the complement of the angle to its
// normal. The absolute value is required because ĥ and n̂ each have an arbitrary sign (a hole can be
// traversed either way, and a plane's pole points to either hemisphere); only the ACUTE angle between
// the hole and the structure is physically meaningful here.
//
// Both vectors are built in the same east/north/up frame: desurveyHole returns world
// {x = easting, y = northing, z = elevation}, and stereonet.js's trendPlungeToVec uses that identical
// convention, so the dot product is directly meaningful with no frame conversion.
import { poleTrendPlunge, trendPlungeToVec } from "./stereonet.js";
import { pointOnTrace } from "./desurvey.js";

// Unit vector along the hole ACROSS a specific intercept, taken as the chord from the intercept's
// own top to its own bottom rather than a tangent at a single point. For a curved (real, surveyed)
// hole those differ, and the chord is the physically right one here: it's the direction the hole
// actually traversed the structure over exactly the interval whose thickness is being corrected.
export function holeDirectionOverInterval(trace, fromMD, toMD) {
  if (!trace || trace.length < 2 || !(toMD > fromMD)) return null;
  const a = pointOnTrace(trace, fromMD);
  const b = pointOnTrace(trace, toMD);
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-9)) return null;
  return { x: dx / len, y: dy / len, z: dz / len };
}

// The dimensionless correction factor |ĥ · n̂| in [0,1]. Returned separately from the width itself so
// callers can surface it directly — a geologist reading a report wants to see HOW oblique the
// intersection was, not just the corrected number (a factor near 1 means a well-oriented hole; a
// factor near 0 means the reported width is nearly meaningless and the hole barely clipped the
// structure).
export function trueWidthFactor(holeDir, structureDipDirDeg, structureDipDeg) {
  if (!holeDir) return null;
  if (!Number.isFinite(structureDipDirDeg) || !Number.isFinite(structureDipDeg)) return null;
  const { trend, plunge } = poleTrendPlunge(structureDipDirDeg, structureDipDeg);
  const n = trendPlungeToVec(trend, plunge);
  const dot = holeDir.x * n.x + holeDir.y * n.y + holeDir.z * n.z;
  return Math.min(1, Math.abs(dot));
}

// Convenience for the reporting path: returns { factor, trueWidth } or null when the geometry can't
// be resolved (hole not found / no survey / degenerate interval). Deliberately returns null rather
// than silently falling back to the downhole length — a report column showing the UNCORRECTED number
// under a "True width" heading would be worse than showing nothing.
export function trueWidthForIntercept(trace, fromMD, toMD, structureDipDirDeg, structureDipDeg) {
  const dir = holeDirectionOverInterval(trace, fromMD, toMD);
  const factor = trueWidthFactor(dir, structureDipDirDeg, structureDipDeg);
  if (factor == null) return null;
  return { factor, trueWidth: (toMD - fromMD) * factor };
}
