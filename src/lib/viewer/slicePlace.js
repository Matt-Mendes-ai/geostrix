// TASKS.csv #3258 (Galore review) — the 3D slice on a property with one cluster and far-flung holes: the range was the extent of ALL holes
// (29 km), the vertical slab opened in its middle (empty ground), one slider step was ~60 m so the 1.2 km cluster was a few millimetres of
// travel, and the pane said nothing about where the slab was or that it held no hole. Now: the range is the checked holes' (all of them when
// none is unchecked), a vertical slab opens on their median collar, and the readout gives the slab's centre and the holes in it.
// Traces: the 3D view's ({ hole_id, pts: [{ x, y, z }] } in scene coordinates: x east, y up, z = -north, from the origin).
import { t as tr } from "../i18n.js";

// the traces the slice works on: the checked holes, or all of them when none is unchecked (or every one is)
export function sliceTraces(traces, visibleHoles) {
  const ts = traces || [];
  const shown = ts.filter((t) => visibleHoles?.[t.hole_id] !== false);
  return shown.length ? shown : ts;
}

// the vertical slab's normal (scene x / z) for a strike azimuth, and the extent's span along it, as the slice effect computes them
export function slabAxis(ext, azimuth) {
  const a = (azimuth * Math.PI) / 180, nx = Math.cos(a), nz = Math.sin(a);
  const d = [[ext.x0, ext.z0], [ext.x1, ext.z0], [ext.x0, ext.z1], [ext.x1, ext.z1]].map(([x, z]) => x * nx + z * nz);
  let lo = Infinity, hi = -Infinity; for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return { nx, nz, lo, hi };
}

// the slider position (0-1) of the median collar along the slab's normal; null when there is nothing to place
export function medianCollarPos(traces, ext, azimuth) {
  const { nx, nz, lo, hi } = slabAxis(ext, azimuth);
  if (!(hi > lo)) return null;
  const d = [];
  for (const t of traces || []) { const p = t.pts?.[0]; if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) d.push(p.x * nx + p.z * nz); }
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return Math.min(1, Math.max(0, (d[Math.floor(d.length / 2)] - lo) / (hi - lo)));
}

// the slab now: its centre on the ground (world E / N, the point on the slab's mid-plane nearest the checked holes' middle) and the holes
// with a trace point inside it -> { e, n, holes } (vertical, thickness > 0), or null
export function slabSummary(traces, ext, slice3d, origin) {
  if (!slice3d?.on || slice3d.mode === "horizontal" || !(slice3d.thickness > 0) || !ext) return null;
  const { nx, nz, lo, hi } = slabAxis(ext, slice3d.azimuth), dc = lo + slice3d.pos * (hi - lo), h = slice3d.thickness / 2;
  let holes = 0;
  for (const t of traces || []) { for (const p of t.pts || []) { const d = p.x * nx + p.z * nz; if (d >= dc - h && d <= dc + h) { holes++; break; } } }
  // the middle of the extent moved onto the slab's mid-plane
  const mx = (ext.x0 + ext.x1) / 2, mz = (ext.z0 + ext.z1) / 2, off = dc - (mx * nx + mz * nz), cx = mx + off * nx, cz = mz + off * nz;
  return { e: cx + (origin?.x || 0), n: (origin?.y || 0) - cz, holes };
}

export function slabSummaryText(s) {
  if (!s) return "";
  const at = tr(" · centred on {e} E, {n} N", { e: Math.round(s.e).toLocaleString(), n: Math.round(s.n).toLocaleString() });
  return at + (s.holes ? tr(s.holes === 1 ? " · {n} hole in the slab" : " · {n} holes in the slab", { n: s.holes }) : tr(" · no hole in the slab: move it or turn it"));
}
