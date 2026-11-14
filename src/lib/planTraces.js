// TASKS.csv #3337 (Galore Creek review) — the Maps plan drew every hole as one dot at its collar, although 29 of the 70 inclined holes end
// more than 100 m from it in plan (341 m at most): the map showed where the rigs stood, not where the rock was tested, and a dot coloured
// by a hole's best copper sat up to 220 m from that copper. Each hole's desurveyed trace in plan (the one trace builder the 3D View and the
// KMZ use, lib/desurvey.js), with a tick at the toe, and the place down the hole of its highest value for 'colour at the intercept'. Pure.
import { desurveyHole, pointOnTrace } from "./desurvey.js";

const num = (v) => (typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v));

// a trace's plan points thinned to about `stepM` metres along the hole (the toe always kept): a 400 m hole sampled every few metres by
// desurveyHole draws the same in plan from a few dozen points
function thin(pts, stepM) {
  const out = [pts[0]];
  let last = pts[0];
  for (let i = 1; i < pts.length - 1; i++) if (pts[i].md - last.md >= stepM) { out.push(pts[i]); last = pts[i]; }
  out.push(pts[pts.length - 1]);
  return out;
}

// -> { traces: Map(hole_id -> { xy: Float64Array [x0, y0, x1, y1 ...], box: [xmin, ymin, xmax, ymax], toe: { x, y }, reachM, pts }), reachMax, longReach (holes ending
// more than 10 m from the collar in plan) }. survey rows carry depth / azimuth / dip (dips as the project stores them).
export function planTraces(collars, survey, method, { stepM = 5 } = {}) {
  const byHole = new Map();
  for (const s of survey || []) { const k = String(s.hole_id); (byHole.get(k) || byHole.set(k, []).get(k)).push({ ...s, depth: num(s.depth), azimuth: num(s.azimuth), dip: num(s.dip) }); }
  const traces = new Map();
  let reachMax = 0, longReach = 0;
  for (const c of collars || []) {
    const x = num(c?.x), y = num(c?.y), z = num(c?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const pts = desurveyHole({ ...c, x, y, z: Number.isFinite(z) ? z : 0 }, byHole.get(String(c.hole_id)) || [], method);
    if (pts.length < 2) continue;
    const t = thin(pts, stepM), toe = pts[pts.length - 1];
    const reachM = Math.hypot(toe.x - x, toe.y - y);
    if (reachM < 0.5) continue; // a vertical hole: its dot says it all
    const xy = new Float64Array(t.length * 2);
    t.forEach((p, i) => { xy[2 * i] = p.x; xy[2 * i + 1] = p.y; });
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of t) { if (p.x < box[0]) box[0] = p.x; if (p.x > box[2]) box[2] = p.x; if (p.y < box[1]) box[1] = p.y; if (p.y > box[3]) box[3] = p.y; }
    traces.set(String(c.hole_id), { xy, box, toe: { x: toe.x, y: toe.y }, reachM, pts });
    if (reachM > reachMax) reachMax = reachM;
    if (reachM > 10) longReach++;
  }
  return { traces, reachMax, longReach };
}

// per hole, where down the hole its highest value lies: Map(hole_id -> { x, y, md, v }) — the mid-point of the interval with the highest
// value, on the trace (a hole with no trace keeps its collar; the caller falls back to the dot there)
export function highestAt(assays, element, traces) {
  const best = new Map();
  for (const r of assays || []) {
    const v = num(r?.values?.[element]);
    if (!Number.isFinite(v) || r.hole_id == null) continue;
    const k = String(r.hole_id), b = best.get(k);
    if (!b || v > b.v) best.set(k, { v, md: (num(r.from) + num(r.to)) / 2 });
  }
  const out = new Map();
  for (const [k, b] of best) {
    const t = traces.get(k);
    if (!t || !Number.isFinite(b.md)) continue;
    const p = pointOnTrace(t.pts, b.md);
    if (p) out.set(k, { x: p.x, y: p.y, md: b.md, v: b.v });
  }
  return out;
}

// the traces in view as one path (a line per hole, a short tick across the toe): ctx a canvas 2D context, X / Y world -> pixel, viewBox
// [xmin, ymin, xmax, ymax] in world units
export function drawTraces(ctx, traces, X, Y, viewBox, { colour = "rgba(26,32,40,0.75)", width = 1.2, tickPx = 4 } = {}) {
  ctx.beginPath();
  for (const t of traces.values()) {
    const xy = t.xy, b = t.box; // the box is computed once, with the trace
    if (b[2] < viewBox[0] || b[0] > viewBox[2] || b[3] < viewBox[1] || b[1] > viewBox[3]) continue;
    for (let i = 0; i < xy.length; i += 2) (i ? ctx.lineTo(X(xy[i]), Y(xy[i + 1])) : ctx.moveTo(X(xy[i]), Y(xy[i + 1])));
    // the toe tick: across the last segment's direction on screen
    const n = xy.length, ax = X(xy[n - 4]), ay = Y(xy[n - 3]), bx = X(xy[n - 2]), by = Y(xy[n - 1]);
    const L = Math.hypot(bx - ax, by - ay) || 1, px = (-(by - ay) / L) * tickPx, py = ((bx - ax) / L) * tickPx;
    ctx.moveTo(bx - px, by - py); ctx.lineTo(bx + px, by + py);
  }
  ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.stroke();
}
