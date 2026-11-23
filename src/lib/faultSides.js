// TASKS.csv #4021 (found by side 2 under #4001) — Model from map, Erosional WITH faults: GemPy's kriging system is singular. Under
// Erosional every top is a series of its own, and by default a fault offsets every series (GemPy's OFFSET_FORMATIONS). An offset adds the
// fault's block to that series' drift; when all of a series' points lie on ONE side of the fault, that drift is the same at every point,
// its column in the system is zero (the drift enters through differences to a reference point) and the matrix is singular. Conformable
// solved only because its one series has points on both sides of every fault.
// So each fault offsets only the tops with points on both of its sides (at least `minEach` beyond `marginM` of it); a top with all its
// points on one side is not offset by that fault (there is nothing to offset it against), and a fault that offsets no top is said.
// Pure; any one frame for faults and tops (the run's api frame). Tested in test/faultSides4021.test.mjs.

const RAD = Math.PI / 180;

// the signed distance of p (x, y, z) from a fault given by its trace (points on the ground) and its dip / dip direction: positive on the
// hangingwall side (the way it dips). The fault plane at depth: below a trace point by dz it lies dz / tan(dip) further along the dip
// direction. The nearest trace segment in plan stands for the fault there; a fault is extended along strike past its ends, as GemPy's is.
export function faultSide(p, trace, dip, dipDir) {
  const h = [Math.sin(dipDir * RAD), Math.cos(dipDir * RAD)];
  const t = Math.tan(Math.max(5, Math.min(89.9, dip)) * RAD);
  let best = null;
  for (let i = 0; i < trace.length; i++) {
    const a = trace[i], b = trace[Math.min(i + 1, trace.length - 1)];
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const q = { x: a.x + u * dx, y: a.y + u * dy, z: a.z + u * (b.z - a.z) };
    const d2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (!best || d2 < best.d2) best = { d2, q };
  }
  if (!best) return NaN;
  const q = best.q;
  return (p.x - q.x) * h[0] + (p.y - q.y) * h[1] - (q.z - p.z) / t;
}

/**
 * faults: [{ meshName, points: [{x,y,z}] (its trace), orientations: [{ dip, azimuth }] }]; tops: [{ meshName, points: [{x,y,z}] }]
 * -> per fault (by meshName): { offsets: [the tops it offsets], oneSided: [the tops left out, all their points on one side] }
 */
export function faultOffsetsBySides(faults, tops, { minEach = 3, marginM = 50 } = {}) {
  const out = {};
  for (const f of faults) {
    const o = f.orientations?.[0];
    const offsets = [], oneSided = [];
    for (const s of tops) {
      if (!o || !(f.points?.length >= 2)) { offsets.push(s.meshName); continue; } // nothing to judge by: GemPy's default
      let pos = 0, neg = 0;
      for (const p of s.points) { const d = faultSide(p, f.points, o.dip, o.azimuth); if (d > marginM) pos++; else if (d < -marginM) neg++; }
      (pos >= minEach && neg >= minEach ? offsets : oneSided).push(s.meshName);
    }
    out[f.meshName] = { offsets, oneSided };
  }
  return out;
}
