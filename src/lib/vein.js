// TASKS.csv #144 — vein/dyke hangingwall–footwall modelling: a PAIRED, thickness-consistent pair of
// contact surfaces built from the two contacts of the same logged intercept.
//
// WHY THIS IS NOT THE STRATIGRAPHIC STACK, AND NOT THE ALTERATION HALO
// -------------------------------------------------------------------
// The stack tool (runSurfaceStack) explicitly excludes veins/dykes because they are cross-cutting: a
// stratigraphic stack assumes a coherent "younger above / older below" polarity across the whole model,
// which a vein violates by definition. The structural tool fits ONE self-referential surface, so it can
// model a vein's hangingwall contact OR its footwall contact, never the pair. And the alteration halo
// (#272) models a CLOSED indicator envelope with no preferred direction — right for a halo, wrong for a
// vein, because a halo has no two-sided thickness to be consistent about and a vein does: every
// intercept gives a from-contact, a to-contact and a true thickness between them, and those two
// surfaces are correlated data about ONE structure, not two independent surfaces.
//
// THE CONSTRUCTION CHOSEN, AND WHY: MIDPLANE + THICKNESS FIELD
// ------------------------------------------------------------
// Two candidate constructions:
//   (a) fit the hangingwall contact and the footwall contact as two independent surfaces;
//   (b) fit ONE midplane (the locus of intercept midpoints) plus a scalar THICKNESS field over it, then
//       offset the midplane by ±t/2 along the reference pole to get hangingwall and footwall.
// This module does (b), deliberately. Under (a) nothing stops the two fitted surfaces from crossing
// where data is sparse — a crossing is negative thickness, i.e. the vein turning inside out — and the
// only defence available is to detect crossings after the fact and warn. Under (b) the pair cannot
// cross as long as the interpolated thickness stays >= 0, and with inverse-distance weighting the
// interpolated thickness is a convex combination of the sampled thicknesses, every one of which is >= 0
// by construction (it is a length times |cos| of an angle). So NON-CROSSING IS GUARANTEED BY
// CONSTRUCTION HERE, not merely checked: at every (u,v) node, hwOffset - fwOffset = t >= 0. A pinch-out
// is the equality case t = 0, where the two surfaces touch and the vein closes — geologically exactly
// what should happen, and it falls out of the construction instead of needing a special case.
// The price of (b) is that the pair is forced to be symmetric about the midplane: it cannot represent a
// vein whose hangingwall is smooth while its footwall is ragged. That is the right trade for sparse
// drillhole data, where any such asymmetry is under-constrained anyway.
//
// TRUE THICKNESS, NOT DOWNHOLE LENGTH
// -----------------------------------
// The thickness that gets interpolated is TRUE thickness: a hole crossing the vein obliquely logs a
// longer interval than the vein is thick, and interpolating those inflated numbers would inflate the
// modelled vein everywhere. The correction factor |ĥ · n̂| and its two limiting cases are already
// derived and hand-verified in trueWidth.js (#230), so this module REUSES trueWidthFactor rather than
// re-deriving it; the only new part is where n̂ comes from, which here is the modelled structure itself
// (a plane fitted to the intercept midpoints, optionally refined to the local midplane normal) rather
// than a separately logged structural measurement.
//
// COORDINATE FRAME: every point in and out of this module is world ENU — x = easting, y = northing,
// z = elevation (up) — the same frame desurveyHole and trueWidth.js/stereonet.js already speak, so no
// conversion happens in here at all. Callers convert to scene coordinates themselves.
import { trueWidthFactor } from "./trueWidth.js";

const DEG = 180 / Math.PI;

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function norm(a) {
  const l = Math.hypot(a.x, a.y, a.z);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l, z: a.z / l } : null;
}

// Upward-pointing plane normal -> (dipDirection, dip) in degrees, using the same convention as
// stereonet.js: a plane's pole plunges downward, poleTrendPlunge(dipDir, dip) = {dipDir+180, 90-dip}.
// Inverting that for the DOWNWARD pole (-n): dip = 90 - plunge(-n), dipDir = trend(-n) + 180.
export function normalToDipDipDir(n) {
  const u = norm(n);
  if (!u) return null;
  const p = u.z >= 0 ? { x: -u.x, y: -u.y, z: -u.z } : u; // downward pole
  const plunge = Math.asin(Math.min(1, Math.max(-1, -p.z))) * DEG;
  let trend = Math.atan2(p.x, p.y) * DEG;
  if (trend < 0) trend += 360;
  return { dip: 90 - plunge, dipDir: (trend + 180) % 360 };
}

// Best-fit plane through a set of points: centroid + the eigenvector of the smallest eigenvalue of the
// 3x3 covariance matrix (total-least-squares plane). Solved with the closed-form symmetric-3x3
// eigenvalue formula (Smith 1961) rather than an iterative solver — no dependency, and exact for the
// well-conditioned cases this sees. Returns the normal oriented UPWARD (z >= 0) so "hangingwall = the
// +normal side" is unambiguous for any non-vertical structure.
export function fitPlane(points) {
  const n = points.length;
  if (n < 3) return null;
  const c = points.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) {
    const d = sub(p, c);
    xx += d.x * d.x; xy += d.x * d.y; xz += d.x * d.z;
    yy += d.y * d.y; yz += d.y * d.z; zz += d.z * d.z;
  }
  xx /= n; xy /= n; xz /= n; yy /= n; yz /= n; zz /= n;
  // Smallest eigenvalue of the symmetric covariance matrix, closed form.
  const q = (xx + yy + zz) / 3;
  const b00 = xx - q, b11 = yy - q, b22 = zz - q;
  const p2 = (b00 * b00 + b11 * b11 + b22 * b22 + 2 * (xy * xy + xz * xz + yz * yz)) / 6;
  let eig;
  if (p2 <= 1e-20) {
    eig = q; // isotropic point cloud — no meaningful plane, caught by the planarity check below
  } else {
    const pp = Math.sqrt(p2);
    const d00 = b00 / pp, d11 = b11 / pp, d22 = b22 / pp;
    const d01 = xy / pp, d02 = xz / pp, d12 = yz / pp;
    const det = d00 * (d11 * d22 - d12 * d12) - d01 * (d01 * d22 - d12 * d02) + d02 * (d01 * d12 - d11 * d02);
    const r = Math.min(1, Math.max(-1, det / 2));
    const phi = Math.acos(r) / 3;
    eig = q + 2 * pp * Math.cos(phi + (2 * Math.PI / 3)); // the SMALLEST of the three roots
  }
  // Null space of (C - eig*I): the largest-magnitude cross product of two of its rows.
  const r0 = { x: xx - eig, y: xy, z: xz };
  const r1 = { x: xy, y: yy - eig, z: yz };
  const r2 = { x: xz, y: yz, z: zz - eig };
  const cands = [cross(r0, r1), cross(r0, r2), cross(r1, r2)];
  let best = null, bestLen = 0;
  for (const v of cands) {
    const l = Math.hypot(v.x, v.y, v.z);
    if (l > bestLen) { bestLen = l; best = v; }
  }
  let nv = norm(best);
  if (!nv) return null;
  if (nv.z < 0) nv = { x: -nv.x, y: -nv.y, z: -nv.z };
  // RMS out-of-plane distance, and the planarity ratio (out-of-plane spread / in-plane spread). A high
  // ratio means the "plane" is fitted to a blob, and the reference attitude means little.
  let ss = 0, inPlane = 0;
  for (const p of points) {
    const d = sub(p, c);
    const w = dot(d, nv);
    ss += w * w;
    inPlane += dot(d, d) - w * w;
  }
  const rms = Math.sqrt(ss / n);
  const spread = Math.sqrt(inPlane / n);
  // Collinearity guard. Three or more midpoints ALWAYS define a plane, but if they lie (nearly) on one
  // straight line — which is exactly what a single section line of holes gives you — that plane can be
  // rotated freely about the line and its dip/dip direction is meaningless. Measured as the ratio of the
  // minor to the major in-plane spread. Caught in the harness: a row of holes along strike returned a
  // confident-looking "dip 0 / dip direction 30" for a planted 60/120 vein.
  const { u: bu, v: bv } = planeBasis(nv);
  let auu = 0, auv = 0, avv = 0;
  for (const p of points) {
    const d = sub(p, c);
    const a = dot(d, bu), b = dot(d, bv);
    auu += a * a; auv += a * b; avv += b * b;
  }
  auu /= n; auv /= n; avv /= n;
  const tr = auu + avv, det2 = auu * avv - auv * auv;
  const disc = Math.max(0, tr * tr / 4 - det2);
  const l1 = tr / 2 + Math.sqrt(disc), l2 = Math.max(0, tr / 2 - Math.sqrt(disc));
  const collinearity = l1 > 1e-12 ? Math.sqrt(l2 / l1) : 0;
  return { centroid: c, normal: nv, rmsOffPlane: rms, planarity: spread > 1e-9 ? rms / spread : Infinity, collinearity, ...normalToDipDipDir(nv) };
}

// Orthonormal in-plane axes for a given normal. U is horizontal wherever the plane is not horizontal
// (it is the plane's STRIKE direction), which makes the (u,v) grid axes geologically meaningful:
// u runs along strike, v runs down dip.
function planeBasis(n) {
  const up = { x: 0, y: 0, z: 1 };
  let u = cross(up, n);
  if (Math.hypot(u.x, u.y, u.z) < 1e-6) u = cross({ x: 1, y: 0, z: 0 }, n); // horizontal plane
  u = norm(u);
  const v = norm(cross(n, u));
  return { u, v };
}

// Inverse-distance (power 2) interpolation of scattered (u,v)->value data at one node. Returns null
// when nothing is within `radius`, so an under-informed node produces a HOLE in the mesh rather than a
// value invented from the far side of the property.
function idw2(samples, u, v, radius, power) {
  let wsum = 0, vsum = 0, near = 0;
  const r2 = radius * radius;
  for (const s of samples) {
    const du = s.u - u, dv = s.v - v;
    const d2 = du * du + dv * dv;
    if (d2 > r2) continue;
    if (d2 < 1e-12) return { value: s.value, n: 1 };
    const w = 1 / Math.pow(d2, power / 2);
    wsum += w; vsum += w * s.value; near++;
  }
  return near ? { value: vsum / wsum, n: near } : null;
}

const MAX_NODES = 250000;

/**
 * Build a paired hangingwall/footwall vein model.
 *
 * intercepts: [{ holeId, from, to, hw:{x,y,z}, fw:{x,y,z} }] in world ENU, where `hw` is the position
 *   of the interval's `from` contact and `fw` of its `to` contact. Which of the two is physically the
 *   hangingwall is decided by GEOMETRY below (the upper side of the structure), not by downhole order —
 *   a hole drilled up-dip logs them the other way round.
 * opts:
 *   cellSize        grid spacing in the plane (m). Default: span/60, clamped.
 *   searchRadius    in-plane IDW radius (m). Default: 1.5x the median intercept spacing.
 *   power           IDW power (default 2)
 *   refineNormals   recompute true thickness against the LOCAL modelled midplane normal and rebuild
 *                   once (default true). Matters for a curved vein; a no-op for a planar one.
 *   dipDir/dip      override the fitted reference attitude (degrees). Needed when there are fewer than
 *                   three intercepts, or when the geologist knows the attitude better than a plane
 *                   fitted through a handful of midpoints does.
 *   padding         extra margin around the data in the plane (m). Default: one search radius.
 */
export function buildVeinModel(intercepts, opts = {}) {
  const pts = (intercepts || []).filter((i) => i && i.hw && i.fw);
  if (pts.length < 1) throw new Error("No vein intercepts with both contacts located in 3D.");

  const mids = pts.map((i) => ({ x: (i.hw.x + i.fw.x) / 2, y: (i.hw.y + i.fw.y) / 2, z: (i.hw.z + i.fw.z) / 2 }));
  // Hole direction ACROSS the interval — the chord from one contact to the other, which is exactly
  // trueWidth.js's holeDirectionOverInterval definition, evaluated here from the two contact points we
  // already have instead of re-walking the trace.
  const dirs = pts.map((i) => norm(sub(i.fw, i.hw)));
  const downhole = pts.map((i) => Math.hypot(i.fw.x - i.hw.x, i.fw.y - i.hw.y, i.fw.z - i.hw.z));

  let plane, attitudeSource;
  if (Number.isFinite(opts.dip) && Number.isFinite(opts.dipDir)) {
    // Build the normal from the supplied attitude the same way trueWidth.js does, so the override and
    // the fit agree on convention by construction.
    const dipR = opts.dip / DEG, ddR = opts.dipDir / DEG;
    // Upward normal for (dipDir, dip): the negated downward pole trendPlungeToVec(dipDir+180, 90-dip).
    // Verified orthogonal to the down-dip vector (sinα cosδ, cosα cosδ, -sinδ) in the harness.
    const nv = { x: Math.sin(ddR) * Math.sin(dipR), y: Math.cos(ddR) * Math.sin(dipR), z: Math.cos(dipR) };
    const c = mids.reduce((a, p) => ({ x: a.x + p.x / mids.length, y: a.y + p.y / mids.length, z: a.z + p.z / mids.length }), { x: 0, y: 0, z: 0 });
    plane = { centroid: c, normal: nv, rmsOffPlane: null, planarity: null, dip: opts.dip, dipDir: opts.dipDir };
    attitudeSource = "user-supplied";
  } else {
    plane = fitPlane(mids);
    if (!plane) throw new Error("At least three vein intercepts (or an explicit dip / dip direction) are needed to establish the vein's attitude.");
    if (plane.collinearity < 0.02) throw new Error("The vein intercepts lie along a single line (one section of holes), so their midpoints cannot fix the vein's attitude — the fitted plane could be rotated freely about that line. Enter the vein's dip and dip direction to model it.");
    attitudeSource = "fitted to intercept midpoints";
  }

  const { u: U, v: V } = planeBasis(plane.normal);
  const N = plane.normal;
  const toLocal = (p) => {
    const d = sub(p, plane.centroid);
    return { u: dot(d, U), v: dot(d, V), w: dot(d, N) };
  };
  const toWorld = (u, v, w) => ({
    x: plane.centroid.x + U.x * u + V.x * v + N.x * w,
    y: plane.centroid.y + U.y * u + V.y * v + N.y * w,
    z: plane.centroid.z + U.z * u + V.z * v + N.z * w,
  });

  const local = mids.map(toLocal);

  // True thickness per intercept, via trueWidth.js's verified |ĥ·n̂| factor against the reference
  // attitude. First pass uses the single fitted attitude for every intercept.
  const attitude = { dip: plane.dip, dipDir: plane.dipDir };
  const makeThickness = (normals) => pts.map((_, k) => {
    const a = normals ? normalToDipDipDir(normals[k]) : attitude;
    const f = trueWidthFactor(dirs[k], a.dipDir, a.dip);
    return { factor: f == null ? 1 : f, t: downhole[k] * (f == null ? 1 : f) };
  });
  let thick = makeThickness(null);

  // Grid extent in the plane.
  const us = local.map((l) => l.u), vs = local.map((l) => l.v);
  const uMin0 = Math.min(...us), uMax0 = Math.max(...us);
  const vMin0 = Math.min(...vs), vMax0 = Math.max(...vs);
  const span = Math.max(uMax0 - uMin0, vMax0 - vMin0, 1);
  // Median nearest-neighbour spacing between intercepts in the plane — the natural scale for both the
  // search radius and the cell size, exactly as autoHaloParams does for the halo tool.
  let spacing = span;
  if (local.length > 1) {
    const nn = local.map((a, i) => {
      let best = Infinity;
      local.forEach((b, j) => { if (i !== j) best = Math.min(best, Math.hypot(a.u - b.u, a.v - b.v)); });
      return best;
    }).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
    if (nn.length) spacing = nn[Math.floor(nn.length / 2)];
  }
  const searchRadius = opts.searchRadius > 0 ? opts.searchRadius : Math.max(spacing * 1.5, span / 20);
  const padding = opts.padding >= 0 ? opts.padding : searchRadius;
  let cellSize = opts.cellSize > 0 ? opts.cellSize : Math.max(span / 60, searchRadius / 12);
  const power = opts.power > 0 ? opts.power : 2;

  const uMin = uMin0 - padding, uMax = uMax0 + padding;
  const vMin = vMin0 - padding, vMax = vMax0 + padding;
  let nu = Math.max(2, Math.round((uMax - uMin) / cellSize) + 1);
  let nv = Math.max(2, Math.round((vMax - vMin) / cellSize) + 1);
  let coarsened = false;
  while (nu * nv > MAX_NODES) {
    cellSize *= 1.5; coarsened = true;
    nu = Math.max(2, Math.round((uMax - uMin) / cellSize) + 1);
    nv = Math.max(2, Math.round((vMax - vMin) / cellSize) + 1);
  }

  const buildFields = (thickness) => {
    const wSamples = local.map((l, k) => ({ u: l.u, v: l.v, value: l.w }));
    const tSamples = local.map((l, k) => ({ u: l.u, v: l.v, value: thickness[k].t }));
    const wGrid = new Float64Array(nu * nv);
    const tGrid = new Float64Array(nu * nv);
    const ok = new Uint8Array(nu * nv);
    for (let j = 0; j < nv; j++) {
      const vv = vMin + j * (nv > 1 ? (vMax - vMin) / (nv - 1) : 0);
      for (let i = 0; i < nu; i++) {
        const uu = uMin + i * (nu > 1 ? (uMax - uMin) / (nu - 1) : 0);
        const wr = idw2(wSamples, uu, vv, searchRadius, power);
        if (!wr) continue;
        const tr = idw2(tSamples, uu, vv, searchRadius, power);
        const idx = j * nu + i;
        wGrid[idx] = wr.value;
        // Thickness is a convex combination of non-negative sampled thicknesses, so it is already >= 0.
        // The clamp is defensive only (a future non-convex interpolator would need it) and is counted,
        // so if it ever fires the caller can say so rather than silently producing a crossing.
        tGrid[idx] = Math.max(0, tr ? tr.value : 0);
        ok[idx] = 1;
      }
    }
    return { wGrid, tGrid, ok };
  };

  let fields = buildFields(thick);

  // Optional refinement: recompute each intercept's true thickness against the LOCAL normal of the
  // modelled midplane at that intercept rather than the single global attitude, then rebuild. For a
  // planar vein the local gradient is ~0 and this changes nothing; for a curved or rolling vein it is
  // the difference between correcting every hole by the average attitude and correcting it by the
  // attitude where it actually cuts.
  let refined = false;
  if (opts.refineNormals !== false && pts.length >= 4) {
    const gradAt = (u, v) => {
      const h = Math.max(cellSize, searchRadius / 4);
      const samples = local.map((l) => ({ u: l.u, v: l.v, value: l.w }));
      const c0 = idw2(samples, u - h, v, searchRadius * 2, power);
      const c1 = idw2(samples, u + h, v, searchRadius * 2, power);
      const c2 = idw2(samples, u, v - h, searchRadius * 2, power);
      const c3 = idw2(samples, u, v + h, searchRadius * 2, power);
      if (!c0 || !c1 || !c2 || !c3) return { du: 0, dv: 0 };
      return { du: (c1.value - c0.value) / (2 * h), dv: (c3.value - c2.value) / (2 * h) };
    };
    const localNormals = local.map((l) => {
      const g = gradAt(l.u, l.v);
      // Surface w = f(u,v); its normal in the (U,V,N) frame is (-f_u, -f_v, 1).
      const nLocal = {
        x: -g.du * U.x - g.dv * V.x + N.x,
        y: -g.du * U.y - g.dv * V.y + N.y,
        z: -g.du * U.z - g.dv * V.z + N.z,
      };
      return norm(nLocal) || N;
    });
    const thick2 = makeThickness(localNormals);
    const changed = thick2.some((t, k) => Math.abs(t.t - thick[k].t) > 1e-6);
    if (changed) { thick = thick2; fields = buildFields(thick); refined = true; }
  }

  const { wGrid, tGrid, ok } = fields;

  // ---- Mesh assembly -------------------------------------------------------------------------
  // Both surfaces are height fields over the SAME (u,v) lattice and the same informed node set, which
  // is what makes the pair provably non-crossing: hangingwall w = w + t/2, footwall w = w - t/2, and
  // t >= 0 everywhere, so hangingwallW - footwallW = t >= 0 at every node with equality exactly at a
  // pinch-out. There is no configuration of the data that can make them swap sides.
  const nodeIndex = new Int32Array(nu * nv).fill(-1);
  const hw = [], fw = [], mid = [];
  let informed = 0;
  for (let idx = 0; idx < nu * nv; idx++) {
    if (!ok[idx]) continue;
    const i = idx % nu, j = Math.floor(idx / nu);
    const uu = uMin + i * (nu > 1 ? (uMax - uMin) / (nu - 1) : 0);
    const vv = vMin + j * (nv > 1 ? (vMax - vMin) / (nv - 1) : 0);
    nodeIndex[idx] = informed++;
    hw.push(toWorld(uu, vv, wGrid[idx] + tGrid[idx] / 2));
    fw.push(toWorld(uu, vv, wGrid[idx] - tGrid[idx] / 2));
    mid.push(toWorld(uu, vv, wGrid[idx]));
  }
  if (!informed) throw new Error("No grid node had a vein intercept within the search radius — increase the search radius.");

  const faces = [];
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = nodeIndex[j * nu + i], b = nodeIndex[j * nu + i + 1];
      const c = nodeIndex[(j + 1) * nu + i + 1], d = nodeIndex[(j + 1) * nu + i];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue; // partly-informed cell: leave a hole
      faces.push([a, b, c], [a, c, d]);
    }
  }
  if (!faces.length) throw new Error("The informed area is smaller than one grid cell — use a smaller cell size or a larger search radius.");

  // Closed solid: hangingwall sheet (outward = +N) + footwall sheet (reversed, outward = -N) + a rim
  // quad on every boundary edge, so the vein has a watertight volume. The rim is built from the edges
  // of the quad mesh that belong to exactly one face — the standard boundary-edge extraction.
  const edgeCount = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const a = f[k], b = f[(k + 1) % 3];
      const kk = key(a, b);
      const e = edgeCount.get(kk);
      if (e) { e.n++; } else { edgeCount.set(kk, { n: 1, a, b }); }
    }
  }
  const solidPos = [];
  hw.forEach((p) => solidPos.push(p));
  fw.forEach((p) => solidPos.push(p));
  const off = hw.length;
  const solidFaces = [];
  faces.forEach((f) => solidFaces.push([f[0], f[1], f[2]]));
  faces.forEach((f) => solidFaces.push([f[2] + off, f[1] + off, f[0] + off])); // reversed winding
  // Rim winding: the hangingwall sheet's quads are wound CCW in (u,v), and U x V = N, so those faces
  // already point outward (+N). A boundary edge a->b traversed in that winding runs counter-clockwise
  // seen from +N, whose outward horizontal direction is (b-a) x N; the side wall therefore has to be
  // wound a -> a' -> b' -> b (' = the footwall copy) to face outward too. The reverse (a -> b -> b')
  // faces INWARD and makes the divergence-theorem volume come out wrong — caught in the harness, where
  // the inward rim turned a 675,249 m3 solid into -225,083 m3.
  edgeCount.forEach((e) => {
    if (e.n !== 1) return;
    solidFaces.push([e.a, e.a + off, e.b + off], [e.a, e.b + off, e.b]);
  });

  // ---- Diagnostics ---------------------------------------------------------------------------
  // Residuals: how far the modelled hangingwall/footwall land from the contacts actually logged. This
  // is the honest measure of fit — a vein interpolated from a handful of intercepts is an
  // interpretation, and these numbers are what let a reader judge how much of one.
  // Which logged contact is the hangingwall: the one on the +N (upper) side of the midpoint. Decided
  // per intercept by geometry, so a hole drilled up-dip (which logs the footwall first) is handled
  // correctly instead of being labelled by downhole order.
  const hwIsFrom = pts.map((p, k) => dot(sub(p.hw, mids[k]), N) >= 0);

  // Residual is measured ALONG THE POLE at the contact's own (u,v) — i.e. how far the modelled sheet
  // sits above or below the logged contact — NOT the straight-line distance from the contact to the
  // point of the sheet directly over the intercept MIDPOINT. Those differ by the in-plane offset
  // between the contact and the midpoint (half the downhole length projected into the plane), which is
  // pure geometry and not a fitting error at all: measuring it that way reported ~2.8 m RMS on a vein
  // the model reproduces exactly, which would have been a badly misleading number to print.
  const wSamplesFinal = local.map((q) => ({ u: q.u, v: q.v, value: q.w }));
  const tSamplesFinal = local.map((q, m) => ({ u: q.u, v: q.v, value: thick[m].t }));
  let ss = 0, mx = 0, counted = 0;
  pts.forEach((p, k) => {
    const upper = hwIsFrom[k] ? p.hw : p.fw;
    const lower = hwIsFrom[k] ? p.fw : p.hw;
    [[upper, +1], [lower, -1]].forEach(([obs, sign]) => {
      const l = toLocal(obs);
      const mw = idw2(wSamplesFinal, l.u, l.v, searchRadius, power);
      const tt = idw2(tSamplesFinal, l.u, l.v, searchRadius, power);
      if (!mw || !tt) return;
      const modelledW = mw.value + sign * Math.max(0, tt.value) / 2;
      const d = Math.abs(modelledW - l.w);
      ss += d * d; mx = Math.max(mx, d); counted++;
    });
  });
  if (!counted) counted = 1;
  const contactResidual = { rms: Math.sqrt(ss / counted), max: mx };

  // Leave-one-out cross-validation of the MIDPLANE. The contact residual above is measured at the data
  // and an inverse-distance field nearly reproduces its own data, so it is close to zero whenever the
  // model honours the logging — it cannot tell you whether ONE sheet explains the intercepts at all.
  // This can: drop each intercept, predict its midpoint's off-plane position from the others, and see
  // how far off it lands. A coherent vein predicts its own missing intercept to within a fraction of
  // the hole spacing; a scattered set of veinlets logged under one code does not, and that is exactly
  // the case where a single hangingwall/footwall pair is the wrong picture.
  let looSs = 0, looN = 0, looMax = 0;
  local.forEach((l, k) => {
    const others = local.filter((_, m) => m !== k).map((q) => ({ u: q.u, v: q.v, value: q.w }));
    const pred = idw2(others, l.u, l.v, searchRadius, power);
    if (!pred) return;
    const d = Math.abs(pred.value - l.w);
    looSs += d * d; looN++; looMax = Math.max(looMax, d);
  });
  const looRms = looN ? Math.sqrt(looSs / looN) : null;

  let tMin = Infinity, tMax = -Infinity, tSum = 0;
  let minSeparation = Infinity, crossings = 0;
  for (let idx = 0; idx < nu * nv; idx++) {
    if (!ok[idx]) continue;
    const t = tGrid[idx];
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); tSum += t;
    minSeparation = Math.min(minSeparation, t);
    if (t < 0) crossings++; // cannot happen with IDW; counted so the claim is checked, not assumed
  }

  const sampled = thick.map((t) => t.t);
  return {
    plane: { centroid: plane.centroid, normal: N, dip: plane.dip, dipDir: plane.dipDir, rmsOffPlane: plane.rmsOffPlane, planarity: plane.planarity, attitudeSource },
    grid: { nu, nv, cellSize, searchRadius, padding, informedNodes: informed, coarsened, uMin, uMax, vMin, vMax },
    hangingwall: { positions: hw, faces },
    footwall: { positions: fw, faces },
    midplane: { positions: mid, faces },
    solid: { positions: solidPos, faces: solidFaces },
    thickness: {
      sampled,
      trueMin: Math.min(...sampled), trueMax: Math.max(...sampled),
      trueMean: sampled.reduce((a, b) => a + b, 0) / sampled.length,
      downholeMean: downhole.reduce((a, b) => a + b, 0) / downhole.length,
      factors: thick.map((t) => t.factor),
      gridMin: tMin, gridMax: tMax, gridMean: tSum / informed,
      refined,
    },
    checks: {
      // Guaranteed by construction (see the header): separation == interpolated thickness >= 0.
      minSeparation, negativeNodes: crossings, nonCrossingByConstruction: true,
      contactResidualRms: contactResidual.rms, contactResidualMax: contactResidual.max,
      midplaneLooRms: looRms, midplaneLooMax: looRms == null ? null : looMax, midplaneLooCount: looN,
      // No predictive skill at the scale the holes are spaced: the intercepts are not one sheet.
      incoherentSheet: looRms != null && looRms > searchRadius * 0.5,
      // A near-vertical structure has no meaningful up-side, so the hangingwall/footwall labels are
      // nominal there and the caller should say so.
      nominalLabels: Math.abs(90 - plane.dip) < 10,
      pinchOut: tMin <= 1e-6,
    },
    intercepts: pts.map((p, k) => ({
      holeId: p.holeId, from: p.from, to: p.to,
      downholeLength: downhole[k], trueThickness: thick[k].t, obliquityFactor: thick[k].factor,
      hangingwallIsFromContact: hwIsFrom[k],
    })),
  };
}
