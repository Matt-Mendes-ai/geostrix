// TASKS.csv #3763 (Scottie Gold review: 84 holes in fans from 57 pads) — with no drill lines the Fence series azimuth fell back to the bearing between
// neighbouring collars (70°, 22° for the 36 'Contact' holes), which says nothing about where fanned holes go: 44 of 83 holes were drilled within 80-120°,
// and the 22 sections at 22° cut each fan into stubs. The commonest HOLE azimuth (folded to 0-180: a section has no direction), from each hole's
// survey stations weighted by their length and how horizontal they are, and for a hole with no survey rows the collar's own azimuth / dip.
// Pure. collars [{ hole_id, azimuth, dip, length }], survey [{ hole_id, depth, azimuth, dip }] ->
// { azimuth (0-179), share (of the holes with a horizontal direction within 15° of it), n (those holes), of (the holes asked) } | null
export const HOLE_AZ_MIN_HOLES = 5, HOLE_AZ_MIN_SHARE = 0.4, HOLE_AZ_NEAR = 15, HOLE_AZ_MIN_HORIZONTAL = 0.17;
const RAD = Math.PI / 180;
export function holeAzimuthOf(collar, rows) {
  let sx = 0, sy = 0, span = 0, w = 0;
  const add = (az, dip, len) => { if (!Number.isFinite(az) || !Number.isFinite(dip) || !(len > 0)) return; const h = Math.cos(dip * RAD); span += len; if (h <= 0) return; w += len * h; sx += len * h * Math.sin(2 * az * RAD); sy += len * h * Math.cos(2 * az * RAD); };
  const st = (rows || []).filter((s) => Number.isFinite(Number(s.depth))).sort((a, b) => a.depth - b.depth);
  if (st.length) {
    const end = Number.isFinite(Number(collar?.length)) && collar.length > st[st.length - 1].depth ? collar.length : st[st.length - 1].depth + 1;
    st.forEach((s, i) => add(Number(s.azimuth), Number(s.dip), (i + 1 < st.length ? st[i + 1].depth : end) - s.depth || 1));
  } else add(Number(collar?.azimuth), Number(collar?.dip), Number.isFinite(Number(collar?.length)) && collar.length > 0 ? collar.length : 1);
  if (!(span > 0) || w / span < HOLE_AZ_MIN_HORIZONTAL || !(Math.hypot(sx, sy) > 0)) return null; // vertical, or no direction
  return ((Math.atan2(sx, sy) / RAD / 2) + 180) % 180;
}
export function commonestHoleAzimuth(collars, survey) {
  const by = new Map();
  for (const s of survey || []) { const k = s?.hole_id; if (k == null) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
  const az = [];
  for (const c of collars || []) { const a = holeAzimuthOf(c, by.get(c.hole_id)); if (a != null) az.push(a); }
  if (az.length < HOLE_AZ_MIN_HOLES) return null;
  const bins = new Array(36).fill(0);
  for (const a of az) bins[Math.floor(a / 5) % 36]++;
  let top = 0; bins.forEach((n, i) => { if (n > bins[top]) top = i; });
  const c0 = top * 5 + 2.5, fold = (b, c) => Math.abs(((b - c + 270) % 180) - 90);
  const near = az.filter((b) => fold(b, c0) <= HOLE_AZ_NEAR);
  const sx = near.reduce((t, b) => t + Math.sin(2 * b * RAD), 0), cy = near.reduce((t, b) => t + Math.cos(2 * b * RAD), 0);
  const azimuth = Math.round((((Math.atan2(sx, cy) / RAD) / 2) + 180) % 180) % 180;
  const share = az.filter((b) => fold(b, azimuth) <= HOLE_AZ_NEAR).length / az.length;
  return share >= HOLE_AZ_MIN_SHARE ? { azimuth, share, n: az.filter((b) => fold(b, azimuth) <= HOLE_AZ_NEAR).length, of: az.length } : null;
}
