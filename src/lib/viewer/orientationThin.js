// TASKS.csv #765 — structure picks averaged into a few representative orientations per hole before they reach GemPy.
//
// Why: GemPy's solve time grows about linearly with the number of orientations (measured on the installed gempy
// 2026.0.3: 10 / 100 / 300 orientations per unit -> 11.9 / 45.9 / 117.8 s at 36^3), and a run on the Harry sample
// sent 317 picks for 88 contact points. Each pick is honoured on its own, so oriented-core scatter (a few degrees
// of dip, more of azimuth) is fitted pick by pick. Measured on a synthetic with 12 holes x 25 picks (8 deg dip / 15 deg
// azimuth scatter): all 300 picks 69.1 s, mean surface error 12.2 m; one averaged orientation per hole 3.6 s, 5.5 m.
//
// How: per hole, picks are taken in depth order and grouped into windows no longer than `windowM` along the hole.
// A pick joins the current window only if its gradient (pole, signed by polarity) is within `maxAngleDeg` of the
// window's mean, so a window never averages across a fold hinge, an overturned limb or a different structure. Each
// window becomes one orientation: the normalised vector mean of its gradients, at the window's mean depth. Picks
// without a hole (outcrop measurements) are not touched here.
//
// Gradient convention matches the sidecar: g = polarity * (sin d sin a, sin d cos a, cos d), with polarity -1 for an
// overturned pick (#430). A mean gradient pointing down is returned as an overturned orientation.

const D2R = Math.PI / 180;

export function gradientOf(dip, azimuth, overturned = false) {
  const d = dip * D2R, a = azimuth * D2R, s = overturned ? -1 : 1;
  return [s * Math.sin(d) * Math.sin(a), s * Math.sin(d) * Math.cos(a), s * Math.cos(d)];
}

export function orientationOfGradient([gx, gy, gz]) {
  const n = Math.hypot(gx, gy, gz) || 1;
  let x = gx / n, y = gy / n, z = gz / n, overturned = false;
  if (z < 0) { x = -x; y = -y; z = -z; overturned = true; }
  const dip = Math.acos(Math.min(1, Math.max(-1, z))) / D2R;
  let azimuth = Math.atan2(x, y) / D2R;
  if (azimuth < 0) azimuth += 360;
  return { dip, azimuth, overturned };
}

const angleDeg = (a, b) => {
  const na = Math.hypot(...a) || 1, nb = Math.hypot(...b) || 1;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  return Math.acos(Math.min(1, Math.max(-1, c))) / D2R;
};

// rows: structure rows { hole_id, depth, dip, azimuth, overturned?, ... }. Returns { rows, before, after, windows }:
// `rows` are the representative rows (same shape; extra fields from the window's first pick, plus `nPicks`).
export function thinStructurePicks(rows, { windowM = 50, maxAngleDeg = 30 } = {}) {
  const byHole = new Map();
  const loose = [];
  for (const r of rows || []) {
    if (r == null || r.hole_id == null || !Number.isFinite(Number(r.depth))) { loose.push(r); continue; }
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
  }
  const out = [...loose];
  for (const picks of byHole.values()) {
    picks.sort((p, q) => Number(p.depth) - Number(q.depth));
    let win = null;
    const flush = () => {
      if (!win) return;
      const o = orientationOfGradient(win.sum);
      const { dip: _d, azimuth: _a, overturned: _o, depth: _dp, ...rest } = win.first;
      out.push({ ...rest, depth: win.depthSum / win.n, dip: o.dip, azimuth: o.azimuth, ...(o.overturned ? { overturned: true } : {}), nPicks: win.n });
      win = null;
    };
    for (const p of picks) {
      const g = gradientOf(Number(p.dip), Number(p.azimuth), !!p.overturned);
      const depth = Number(p.depth);
      if (win && depth - win.start <= windowM && angleDeg(g, win.sum) <= maxAngleDeg) {
        win.sum = [win.sum[0] + g[0], win.sum[1] + g[1], win.sum[2] + g[2]];
        win.depthSum += depth; win.n++;
      } else {
        flush();
        win = { start: depth, sum: g, depthSum: depth, n: 1, first: p };
      }
    }
    flush();
  }
  return { rows: out, before: (rows || []).length, after: out.length };
}
