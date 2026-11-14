// TASKS.csv #2630 (1) — an interpretation-line click in the 3D View snaps to a collar, a logged boundary of a shown interval layer, or
// a hole's trace, so a contact drawn on the map can be tied to the holes that cut it (the section window's contact tool already
// snaps, lib/sectionDigitise.js). Pure: no three.js. Everything is in SCENE coordinates (x = E - ox, y = Z - oz, z = oy - N), the
// frame the pick ray is in; the snapped point comes back in WORLD coordinates (E, N, Z) with what it is tied to.
//
// traces: the 3D View's tracesRef ([{ hole_id, pts: [{ md, x, y, z }] scene, wx, wy, wz }]); layers: store.layers; shown: the interval
// layer keys drawn (from layerVisible); labelOf(key) -> the layer's name. The index (collars + boundaries, Float64Array) is built once per traces /
// layers / shown / origin and reused for every click, so a click on a 20,000-hole project is one linear pass, not a rebuild.
import { LAYER_META } from "../layers.js";

export const SNAP_PX = 12;
// the interval layers switched on (layerVisible), the only ones whose boundaries a click snaps to
export const shownIntervalLayers = (visible) => Object.keys(visible || {}).filter((k) => visible[k] && LAYER_META[k]?.kind === "interval");
const layerLabel = (k) => LAYER_META[k]?.label || k;

let cache = null; // { traces, layers, shownKey, ox, oy, oz, index }

// TASKS.csv #3044 (#2972) — on the Surface Geology tab a line is drawn along mapped contacts and through outcrop stations: a click also snaps
// to a vertex of a shown map layer or to an outcrop reading's station. The 3D View passes the holes only, so the Interpretation pane registers
// these (world E / N / Z, the Z on the ground the layer is drawn on): { points: [{ x, y, z, label, kind: "vertex" | "station" }] } or null.
let extras = null, extrasCache = null; // extrasCache: { extras, ox, oy, oz, index }
export function setInterpretSnapExtras(e) { extras = e && e.points?.length ? e : null; }
function extrasIndexFor(origin) {
  if (!extras) return null;
  const c = extrasCache;
  if (c && c.extras === extras && c.ox === origin.x && c.oy === origin.y && c.oz === origin.z) return c.index;
  const xyz = new Float64Array(extras.points.length * 3), info = [];
  extras.points.forEach((p, i) => { xyz[i * 3] = p.x - origin.x; xyz[i * 3 + 1] = (Number.isFinite(p.z) ? p.z : origin.z) - origin.z; xyz[i * 3 + 2] = origin.y - p.y; info.push({ hole_id: null, md: 0, label: p.label, kind: p.kind }); });
  const index = { xyz, info, traces: [] };
  extrasCache = { extras, ox: origin.x, oy: origin.y, oz: origin.z, index };
  return index;
}
// the kinds a plan look snaps to (#2972: not a contact down a hole under its collar): collars and what lies on the ground
const PLAN_KINDS = new Set(["collar", "vertex", "station"]);

function pointAt(pts, md) {
  if (!pts?.length) return null;
  if (md <= pts[0].md) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    if (md <= q.md) { const f = (md - p.md) / (q.md - p.md || 1e-12); return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f }; }
  }
  return pts[pts.length - 1];
}

export function buildSnapIndex(traces, layers, shown, labelOf = (k) => k) {
  const byHole = new Map((traces || []).map((t) => [t.hole_id, t]));
  const seen = new Set(), xyz = [], info = [];
  const add = (t, md, label, kind) => {
    const k = `${t.hole_id}|${md}`;
    if (seen.has(k)) return;
    const p = pointAt(t.pts, md);
    if (!p) return;
    seen.add(k); xyz.push(p.x, p.y, p.z); info.push({ hole_id: t.hole_id, md, label, kind });
  };
  for (const t of byHole.values()) add(t, t.pts?.[0]?.md ?? 0, "collar", "collar");
  for (const key of shown || []) {
    for (const r of layers?.[key] || []) {
      const t = byHole.get(r.hole_id);
      if (!t || !Number.isFinite(r.from) || !Number.isFinite(r.to)) continue;
      const label = `${labelOf(key)}: ${r.value ?? ""}`;
      add(t, r.from, label, "boundary"); add(t, r.to, label, "boundary");
    }
  }
  return { xyz: Float64Array.from(xyz), info, traces: [...byHole.values()] };
}

export function snapIndexFor(traces, layers, shown, origin, labelOf) {
  const shownKey = (shown || []).join(",");
  const c = cache;
  if (c && c.traces === traces && c.layers === layers && c.shownKey === shownKey && c.ox === origin.x && c.oy === origin.y && c.oz === origin.z) return c.index;
  const index = buildSnapIndex(traces, layers, shown, labelOf);
  cache = { traces, layers, shownKey, ox: origin.x, oy: origin.y, oz: origin.z, index };
  return index;
}

// ray: { origin: {x,y,z}, direction: {x,y,z} unit } (scene); tolAt(t) -> the snap distance (scene units) at distance t along the ray.
// -> { x, y, z (scene), hole_id, md, label, kind } or null. A collar or boundary within reach wins (the one nearest the ray, in pixels);
// else the nearest point of a trace within reach (kind "trace").
// TASKS.csv #2972 (WA iron review) — looking (nearly) straight down, every logged contact and trace point of a vertical hole is under its
// collar on screen, so a click by a collar on the plan tied the line to 'RHRC05610360 at 34 m (Lithology: BNAM)'. In a plan look (the ray
// within PLAN_COS of vertical) only collars are taken; a contact down the hole is snapped to from an oblique or section view.
export const PLAN_COS = Math.cos((15 * Math.PI) / 180);
export const isPlanLook = (ray) => Math.abs(ray?.direction?.y ?? 0) >= PLAN_COS; // scene y is up
export function snapRay(index, ray, tolAt) {
  const o = ray.origin, d = ray.direction, a = index.xyz, plan = isPlanLook(ray);
  let best = null;
  for (let i = 0; i < a.length; i += 3) {
    if (plan && !PLAN_KINDS.has(index.info[i / 3].kind)) continue; // #2972; map vertices and stations: #3044
    const vx = a[i] - o.x, vy = a[i + 1] - o.y, vz = a[i + 2] - o.z;
    const t = vx * d.x + vy * d.y + vz * d.z;
    if (t <= 0) continue;
    const px = vx - t * d.x, py = vy - t * d.y, pz = vz - t * d.z;
    const tol = tolAt(t), perp = Math.sqrt(px * px + py * py + pz * pz);
    if (perp > tol) continue;
    const r = perp / tol;
    if (!best || r < best.r) best = { r, i: i / 3 };
  }
  if (best) { const k = best.i * 3, inf = index.info[best.i]; return { x: a[k], y: a[k + 1], z: a[k + 2], ...inf }; }
  if (plan) return null; // #2972 — no trace point in a plan look either
  // the nearest point on a trace segment: closest approach of the ray and the segment
  let bt = null;
  for (const tr of index.traces) {
    const pts = tr.pts || [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
      const wx = p.x - o.x, wy = p.y - o.y, wz = p.z - o.z;
      const A = ux * ux + uy * uy + uz * uz, B = ux * d.x + uy * d.y + uz * d.z, D = wx * d.x + wy * d.y + wz * d.z, E = wx * ux + wy * uy + wz * uz;
      const den = A - B * B; // d is unit
      let s = den > 1e-12 ? (B * D - E) / den : 0;
      s = Math.min(1, Math.max(0, s));
      const cx = p.x + ux * s, cy = p.y + uy * s, cz = p.z + uz * s;
      const vx = cx - o.x, vy = cy - o.y, vz = cz - o.z, t = vx * d.x + vy * d.y + vz * d.z;
      if (t <= 0) continue;
      const qx = vx - t * d.x, qy = vy - t * d.y, qz = vz - t * d.z, perp = Math.sqrt(qx * qx + qy * qy + qz * qz), tol = tolAt(t);
      if (perp > tol) continue;
      const r = perp / tol;
      if (!bt || r < bt.r) bt = { r, x: cx, y: cy, z: cz, hole_id: tr.hole_id, md: p.md + (q.md - p.md) * s };
    }
  }
  return bt ? { x: bt.x, y: bt.y, z: bt.z, hole_id: bt.hole_id, md: bt.md, label: "trace", kind: "trace" } : null;
}

// the snap reach at distance t: a perspective camera's angle per pixel, or an orthographic camera's units per pixel
export function snapTolerance(camera, heightPx, px = SNAP_PX) {
  if (camera?.isOrthographicCamera) { const u = ((camera.top - camera.bottom) / (camera.zoom || 1)) / heightPx; return () => px * u; }
  const a = (((camera?.fov ?? 50) * Math.PI) / 180) / heightPx / (camera?.zoom || 1);
  return (t) => t * a * px;
}

// The click's world point, snapped when `on`: world (the raycast hit, world coords, or null), ray (scene), opts { on, traces, layers,
// visible (layerVisible), origin, camera, heightPx }. Returns the hit unchanged when nothing is in reach.
export function snapInterpretClick(world, ray, { on, traces, layers, visible, origin, camera, heightPx }) {
  const ex = on && origin ? extrasIndexFor(origin) : null; // #3044
  if (!on || !origin || (!traces?.length && !ex)) return world;
  const tol = snapTolerance(camera, heightPx);
  const holes = traces?.length ? snapRay(snapIndexFor(traces, layers, shownIntervalLayers(visible), origin, layerLabel), ray, tol) : null;
  // #3044 — a map vertex or station nearer the ray (in pixels) than the hole's point wins; a hole tie stays a tie otherwise
  const ground = ex ? snapRay(ex, ray, tol) : null;
  const near = (p) => { if (!p) return Infinity; const o = ray.origin, d = ray.direction, vx = p.x - o.x, vy = p.y - o.y, vz = p.z - o.z, t = vx * d.x + vy * d.y + vz * d.z; const px = vx - t * d.x, py = vy - t * d.y, pz = vz - t * d.z; return Math.sqrt(px * px + py * py + pz * pz) / (tol(Math.max(t, 1e-6)) || 1); };
  const s = ground && near(ground) < near(holes) ? ground : holes;
  if (!s) return world;
  if (!s.hole_id) return { x: s.x + origin.x, y: origin.y - s.z, z: s.y + origin.z, snap: { label: s.label, kind: s.kind } }; // no tie: the spot only
  return { x: s.x + origin.x, y: origin.y - s.z, z: s.y + origin.z, snap: { hole_id: s.hole_id, md: +s.md.toFixed(2), label: s.label, kind: s.kind } };
}
