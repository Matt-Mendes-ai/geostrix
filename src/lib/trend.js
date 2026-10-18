// TASKS.csv #650 — structural trends for geology and grade models, as in Leapfrog's Trend tab: a plane (dip, dip
// azimuth), the direction of greatest continuity within it (pitch), and the ellipsoid ratios
// maximum : intermediate : minimum. Named trends live in the project; each model picks one (or none).
//
// Conventions (degrees; east, north, up — the same frame as viewer/geomath.js's searchEllipsoidBasis):
//   dip          0-90, the plane's dip
//   dipAzimuth   0-360 clockwise from north, the direction the plane dips towards
//   pitch        0-180 in the plane, measured from the strike line (dip azimuth - 90, right-hand rule)
//                towards the down-dip line: 0 = along strike, 90 = straight down dip
//   ratios       { max, int, min } > 0 — relative lengths along major / intermediate / minor
// The major axis is the pitch line, the intermediate the in-plane line at right angles to it, the minor the
// plane's normal. The old two-angle anisotropy (major plunging `dip` towards `azimuth`, semi-major horizontal)
// is exactly { dip, dipAzimuth: azimuth, pitch: 90 } — fromLegacyAnisotropy.
const rad = Math.PI / 180, deg = 180 / Math.PI;
const norm360 = (a) => (a >= 0 && a < 360 ? a : ((a % 360) + 360) % 360); // untouched when already in range (no float noise)
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export const DEFAULT_TREND = { name: "Trend", dip: 45, dipAzimuth: 90, pitch: 90, ratios: { max: 3, int: 2, min: 1 } };

// a valid trend from anything (clamped angles, positive ratios, sorted so max >= int >= min)
export function cleanTrend(t) {
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const r = t?.ratios || {};
  const vals = [n(r.max, 3), n(r.int, 2), n(r.min, 1)].map((v) => Math.max(1e-3, Math.abs(v))).sort((a, b) => b - a);
  return {
    ...(t || {}),
    name: String(t?.name || DEFAULT_TREND.name).slice(0, 80),
    dip: Math.min(90, Math.max(0, n(t?.dip, DEFAULT_TREND.dip))),
    dipAzimuth: norm360(n(t?.dipAzimuth, DEFAULT_TREND.dipAzimuth)),
    pitch: Math.min(180, Math.max(0, n(t?.pitch, DEFAULT_TREND.pitch))),
    ratios: { max: vals[0], int: vals[1], min: vals[2] },
  };
}

// { major, semiMajor, minor } unit vectors — the same shape searchEllipsoidBasis returns, so every existing
// warp (anisoWarpPoint) takes it unchanged
export function trendBasis(t) {
  const { dip, dipAzimuth, pitch } = cleanTrend(t);
  const dd = dipAzimuth * rad, dp = dip * rad, p = pitch * rad;
  const strike = { x: -Math.cos(dd), y: Math.sin(dd), z: 0 }; // dip azimuth - 90
  const down = { x: Math.sin(dd) * Math.cos(dp), y: Math.cos(dd) * Math.cos(dp), z: -Math.sin(dp) };
  const major = { x: Math.cos(p) * strike.x + Math.sin(p) * down.x, y: Math.cos(p) * strike.y + Math.sin(p) * down.y, z: Math.cos(p) * strike.z + Math.sin(p) * down.z };
  const semiMajor = { x: -Math.sin(p) * strike.x + Math.cos(p) * down.x, y: -Math.sin(p) * strike.y + Math.cos(p) * down.y, z: -Math.sin(p) * strike.z + Math.cos(p) * down.z };
  return { major, semiMajor, minor: cross(major, semiMajor) };
}

// Warp scales that keep volume (only the ratios matter) — what the implicit models / alteration / grade shell
// warp uses (viewer/geomath.js anisoScales, same formula).
export function trendScales(t) {
  const { max, int, min } = cleanTrend(t).ratios;
  const iso = Math.cbrt(max * int * min);
  return { major: iso / max, semiMajor: iso / int, minor: iso / min };
}
// Scales for a SEARCH ellipsoid whose major semi-axis is the search radius (Leapfrog / Micromine convention):
// distances along the major axis are unchanged, the other axes are stretched so the radius reaches only
// radius * int / max and radius * min / max along them.
export function trendSearchScales(t) {
  const { max, int, min } = cleanTrend(t).ratios;
  return { major: 1, semiMajor: max / int, minor: max / min };
}

export function fromLegacyAnisotropy(a) {
  return cleanTrend({ name: "Model trend", dip: a?.dip, dipAzimuth: a?.azimuth, pitch: 90, ratios: { max: a?.major, int: a?.semiMajor, min: a?.minor } });
}

// The mean plane of a set of poles (or plane normals, either sign). TASKS.csv #654 — poles are AXIAL data: a
// steep plane logged 88/090 and 87/270 is one structure whose two "down" poles point opposite ways, so a vector
// mean cancels (six picks of a vertical vein set averaged to a 1 deg dip). The mean is the principal axis of
// the orientation tensor T = sum(v v^T), the statistic the stereonet's fisherStats uses, so the two agree.
// { dip, dipAzimuth, n, s1 } | null — s1 = largest eigenvalue / n (1 = all parallel, 1/3 = no preferred axis).
export function planeFromPoles(poles) {
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let n = 0, sx = 0, sy = 0, sz = 0;
  for (const v of poles || []) {
    if (!v || ![v.x, v.y, v.z].every(Number.isFinite)) continue;
    const len = Math.hypot(v.x, v.y, v.z); if (!len) continue;
    const u = [v.x / len, v.y / len, v.z / len];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) T[a][b] += u[a] * u[b];
    const sg = u[2] > 0 ? -1 : 1; sx += sg * u[0]; sy += sg * u[1]; sz += sg * u[2]; n++;
  }
  if (!n) return null;
  // power iteration for the principal eigenvector; start from the largest row of T (never orthogonal to it)
  let w = T.reduce((best, r) => (Math.hypot(...r) > Math.hypot(...best) ? r : best), T[0]).slice();
  if (Math.hypot(sx, sy, sz) > 0.5 * n) w = [sx, sy, sz]; // a tight cluster: its mean is already close
  let lam = 0;
  for (let k = 0; k < 200; k++) {
    const q = [0, 1, 2].map((a) => T[a][0] * w[0] + T[a][1] * w[1] + T[a][2] * w[2]);
    const l = Math.hypot(...q); if (!l) return null;
    const next = q.map((x) => x / l);
    const done = Math.abs(Math.abs(next[0] * w[0] + next[1] * w[1] + next[2] * w[2]) / (Math.hypot(...w) || 1) - 1) < 1e-15;
    w = next; lam = l;
    if (done && k > 3) break;
  }
  const plane = planeFromNormal({ x: w[0], y: w[1], z: w[2] });
  return plane && { ...plane, n, s1: lam / n };
}
// a plane from its normal (either sign)
export function planeFromNormal(nrm) {
  let { x, y, z } = nrm; const len = Math.hypot(x, y, z); if (!len) return null;
  x /= len; y /= len; z /= len;
  if (z < 0) { x = -x; y = -y; z = -z; } // upward normal: it leans towards the dip direction
  const dip = Math.acos(Math.min(1, z)) * deg;
  const dipAzimuth = dip < 1e-6 ? 0 : norm360(Math.atan2(x, y) * deg);
  return { dip, dipAzimuth };
}
// the downward pole of a plane given as (dip, dip azimuth) — e.g. a logged structure measurement
export function poleOf(dip, dipAzimuth) {
  const dp = dip * rad, dd = dipAzimuth * rad;
  return { x: -Math.sin(dp) * Math.sin(dd), y: -Math.sin(dp) * Math.cos(dd), z: -Math.cos(dp) };
}
// best-fit plane through points ({x, y, z}) by least squares (the normal is the smallest-variance direction)
export function planeFromPoints(pts) {
  const P = (pts || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite));
  if (P.length < 3) return null;
  const c = P.reduce((a, p) => ({ x: a.x + p.x / P.length, y: a.y + p.y / P.length, z: a.z + p.z / P.length }), { x: 0, y: 0, z: 0 });
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  // smallest eigenvector by inverse power iteration on C + tiny ridge
  const A = C.map((r, i) => r.map((v, j) => v + (i === j ? 1e-9 * (C[0][0] + C[1][1] + C[2][2] + 1) : 0)));
  const inv = invert3(A); if (!inv) return null;
  let v = [0.3, 0.4, 0.86];
  for (let k = 0; k < 60; k++) {
    const w = [0, 1, 2].map((i) => inv[i][0] * v[0] + inv[i][1] * v[1] + inv[i][2] * v[2]);
    const l = Math.hypot(...w); if (!l) return null; v = w.map((q) => q / l);
  }
  return planeFromNormal({ x: v[0], y: v[1], z: v[2] });
}
function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C; if (Math.abs(det) < 1e-300) return null;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}

export const describeTrend = (t) => { const c = cleanTrend(t); return `dip ${c.dip.toFixed(0)}° → ${c.dipAzimuth.toFixed(0)}°, pitch ${c.pitch.toFixed(0)}°, ${+c.ratios.max.toFixed(2)} : ${+c.ratios.int.toFixed(2)} : ${+c.ratios.min.toFixed(2)}`; };

// TASKS.csv #650 — the same trend in geoML's terms (geoml.transform.Anisotropy3D): its azimuth / dip are the plunge
// direction and plunge of the MAXIMUM axis (dip 0-90, down), rake (-90..90) spins the intermediate and minimum axes
// about it, and the ranges are fractions (intermediate / maximum, minimum / intermediate). Derived from its
// refresh(): axes = Rz(azimuth) Rx(-dip) Ry(rake) [e_x mid, e_y max, e_z min]; checked against the real class.
export function trendToGeoml(t) {
  const c = cleanTrend(t), b = trendBasis(c);
  let m = b.major, s = b.semiMajor;
  if (m.z > 0) m = { x: -m.x, y: -m.y, z: -m.z }; // the plunge points down
  const dip = Math.asin(Math.min(1, -m.z)) * deg;
  const az = Math.abs(dip - 90) < 1e-9 ? 0 : norm360(Math.atan2(m.x, m.y) * deg);
  const a = az * rad, d = dip * rad;
  const mid0 = { x: Math.cos(a), y: -Math.sin(a), z: 0 };
  const min0 = { x: Math.sin(a) * Math.sin(d), y: Math.cos(a) * Math.sin(d), z: Math.cos(d) };
  // mid = cos(r) mid0 - sin(r) min0; the intermediate axis has no sign, so r is folded into -90..90
  let r = Math.atan2(-(s.x * min0.x + s.y * min0.y + s.z * min0.z), s.x * mid0.x + s.y * mid0.y + s.z * mid0.z) * deg;
  if (r > 90) r -= 180; else if (r < -90) r += 180;
  return { azimuth: az, dip, rake: r, midFct: c.ratios.int / c.ratios.max, minFct: c.ratios.min / c.ratios.int };
}
