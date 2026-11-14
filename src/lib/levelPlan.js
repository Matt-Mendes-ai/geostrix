// TASKS.csv #525 — level plans (horizontal sections at an RL). The vertical section tools (#98 / #357 / #499) cut
// everything with a vertical plane along a line; a plan at, say, 850 m RL cuts with the horizontal plane z = RL and
// keeps what lies within a slab RL ± half-width. Pure geometry here (no React, no three.js), shared by the plan
// window and its tests:
//   slabRuns      the depth runs of a trace inside the slab (what is drawn on the plan, and what logs are clipped to)
//   piercePoints  where a trace crosses the RL exactly (the classic level-plan "pierce point", with its depth)
//   voxelPlanRects  block-model cells whose vertical extent contains the RL, as E/N rectangles
//   meshPlanCut   a triangle mesh cut by the plane z = RL, as E/N segments (model surfaces, solids)
// A trace is [{ md, x (E), y (N), z (elevation) }], as desurveyHole returns.
import { magColor } from "./layers.js"; // #1537
import { gradeText } from "./gradeText.js"; // TASKS.csv #2515

// md runs [[md0, md1], ...] where zmin <= z <= zmax, interpolated at the crossings
export function slabRuns(trace, zmin, zmax) {
  const runs = [];
  let start = null;
  const inside = (p) => p.z >= zmin && p.z <= zmax;
  const cross = (p, q, zc) => p.md + ((q.md - p.md) * (zc - p.z)) / (q.z - p.z || 1e-12);
  for (let i = 0; i < trace.length; i++) {
    const p = trace[i];
    if (i === 0) { if (inside(p)) start = p.md; continue; }
    const q = trace[i - 1];
    const pin = inside(p), qin = inside(q);
    if (pin && !qin) start = cross(q, p, q.z < zmin ? zmin : zmax);
    if (!pin && qin) { runs.push([start, cross(q, p, p.z < zmin ? zmin : zmax)]); start = null; }
    if (!pin && !qin && ((q.z < zmin && p.z > zmax) || (q.z > zmax && p.z < zmin))) {
      // passes straight through the slab between two samples
      const a = cross(q, p, q.z > zmax ? zmax : zmin), b = cross(q, p, q.z > zmax ? zmin : zmax);
      runs.push([Math.min(a, b), Math.max(a, b)]);
    }
  }
  if (start != null) runs.push([start, trace[trace.length - 1].md]);
  return runs.filter(([a, b]) => b - a > 1e-9 || trace.length === 1);
}

// position on a trace at depth md (linear between samples)
export function pointAtMd(trace, md) {
  if (!trace.length) return null;
  if (md <= trace[0].md) return { ...trace[0] };
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    if (md <= q.md) { const f = (md - p.md) / (q.md - p.md || 1e-12); return { md, x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f }; }
  }
  return { ...trace[trace.length - 1] };
}

// every crossing of z = rl: [{ md, x, y }]
export function piercePoints(trace, rl) {
  const out = [];
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    if ((p.z - rl) * (q.z - rl) <= 0 && p.z !== q.z) {
      const f = (rl - p.z) / (q.z - p.z);
      if (f < 0 || f > 1 || (f === 0 && i > 1)) continue; // a sample exactly on the RL is counted once
      out.push({ md: p.md + (q.md - p.md) * f, x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
    }
  }
  return out;
}

// the parts of a trace inside the md runs, as E/N polylines
// TASKS.csv #3414 — the [x, y] pairs made directly (a point object per end and a second array per run were most of what a Level plan open on
// WA iron's 6,390 holes allocated here); the same pairs as pointAtMd's
function xyAtMd(trace, md) {
  if (md <= trace[0].md) return [trace[0].x, trace[0].y];
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    if (md <= q.md) { const f = (md - p.md) / (q.md - p.md || 1e-12); return [p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f]; }
  }
  const e = trace[trace.length - 1];
  return [e.x, e.y];
}
export function tracePolylines(trace, runs) {
  if (!trace.length) return runs.map(() => []);
  return runs.map(([a, b]) => {
    const out = [xyAtMd(trace, a)];
    for (const p of trace) if (p.md > a && p.md < b) out.push([p.x, p.y]);
    out.push(xyAtMd(trace, b));
    return out;
  });
}

// block-model cells cut by the RL: { x0, y0, x1, y1, value, cell }
export function voxelPlanRects(cells, rl) {
  const out = [];
  for (const c of cells || []) {
    const dz = c.dz || 0;
    if (rl < c.z - dz / 2 || rl > c.z + dz / 2) continue;
    out.push({ x0: c.x - (c.dx || 0) / 2, y0: c.y - (c.dy || 0) / 2, x1: c.x + (c.dx || 0) / 2, y1: c.y + (c.dy || 0) / 2, value: c.value, cell: c });
  }
  return out;
}

// a triangle mesh cut by z = rl. `vertexAt(i)` -> {x (E), y (N), z} in world coordinates; `triangles` = vertex
// index triples (flat). Returns [[e0, n0, e1, n1], ...].
export function meshPlanCut(vertexCount, triangles, vertexAt, rl) {
  const segs = [];
  const V = new Array(vertexCount);
  const at = (i) => V[i] || (V[i] = vertexAt(i));
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const v = [at(triangles[t]), at(triangles[t + 1]), at(triangles[t + 2])];
    const cut = [];
    for (let e = 0; e < 3; e++) {
      const p = v[e], q = v[(e + 1) % 3];
      const dp = p.z - rl, dq = q.z - rl;
      if ((dp <= 0 && dq > 0) || (dp > 0 && dq <= 0)) {
        const f = dp / (dp - dq);
        cut.push([p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f]);
      }
    }
    if (cut.length === 2) segs.push([cut[0][0], cut[0][1], cut[1][0], cut[1][1]]);
  }
  return segs;
}

// a strike / dip symbol for a structure pick on the plan: strike line through the point (half-length `len`)
// and a dip tick toward the dip direction. Bearings in degrees clockwise from grid north.
export function strikeDipSymbol(x, y, dip, dipDir, len = 6) {
  const s = ((dipDir - 90) * Math.PI) / 180, d = (dipDir * Math.PI) / 180;
  return {
    strike: [x - len * Math.sin(s), y - len * Math.cos(s), x + len * Math.sin(s), y + len * Math.cos(s)],
    tick: [x, y, x + (len / 2.2) * Math.sin(d), y + (len / 2.2) * Math.cos(d)],
    label: `${Math.round(dip)}`,
  };
}

// TASKS.csv #1537 (review #1497, Lawyers) — 'Colour holes by' offered only logged intervals: for an Au-Ag project the plan that
// matters is Au at the RL. Each assay element drawn in the 3D View becomes a choice ("assay:<sym>"): its sample intervals clipped
// to the slab, and the pierce points filled by the sample at the RL. Colours: the element's grade classes when it has them (as in
// 3D); otherwise a viridis ramp over that element's values in the whole project (2nd-98th percentile, log when they span more than
// a decade), so the colours do not change with the RL. legends: { "assay:<sym>": { title, items: [[label, color]] } }.
// points: buildPlanPayload's points ({ hole_id, color, assay: { sym, value, from, to, u } }); holes: [{ hole_id, trace, runs, pierce }]
// (pierce points need .logs already); groups: assayLegendGroups' output; projectValues(sym) -> every value of that element.
const fmt3 = (v) => String(+Number(v).toPrecision(3));
export function assayRamp(values) {
  const v = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  let lo = q(0.02), hi = q(0.98);
  if (!(hi > lo)) { lo = v[0]; hi = v[v.length - 1]; }
  const log = lo > 0 && hi / lo > 10;
  const t = (x) => (log ? (Math.log10(Math.max(x, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : hi > lo ? (x - lo) / (hi - lo) : 0);
  const color = (x) => magColor(Math.min(1, Math.max(0, t(x))), 0, 1);
  const at = (k) => (log ? 10 ** (Math.log10(lo) + (k / 4) * (Math.log10(hi) - Math.log10(lo))) : lo + (k / 4) * (hi - lo));
  const items = [0, 1, 2, 3, 4].map((k) => [k === 0 ? `≤ ${fmt3(at(k))}` : k === 4 ? `≥ ${fmt3(at(k))}` : fmt3(at(k)), color(at(k))]);
  return { lo, hi, log, color, items };
}
export function planAssayLayers(points, holes, groups, projectValues) {
  const bySym = new Map();
  for (const p of points || []) if (p.assay) { if (!bySym.has(p.assay.sym)) bySym.set(p.assay.sym, []); bySym.get(p.assay.sym).push(p); }
  const holeOf = new Map((holes || []).map((h) => [h.hole_id, h]));
  const intervals = [], legends = {};
  for (const [sym, pts] of bySym) {
    const layer = `assay:${sym}`, g = (groups || []).find((x) => x.key === `assay_${sym}`), unit = pts[0].assay.u || "";
    const ramp = g?.grade ? null : assayRamp(projectValues ? projectValues(sym) : pts.map((p) => p.assay.value));
    const colorOf = (p) => (ramp ? ramp.color(Number(p.assay.value)) : p.color);
    legends[layer] = { title: unit ? `${sym} (${unit})` : sym, items: ramp ? ramp.items.map(([l, c]) => [unit ? `${l} ${unit}` : l, c]) : (g?.items || []).filter(([, c]) => c && c !== "transparent") };
    for (const p of pts) {
      const h = holeOf.get(p.hole_id); if (!h) continue;
      const { from, to, value } = p.assay, color = colorOf(p), label = `${sym}: ${gradeText(value)}${unit ? ` ${unit}` : ""}`; // gradeText: #2515
      const parts = (h.runs || []).map(([a, b]) => [Math.max(from, a), Math.min(to, b)]).filter(([a, b]) => b - a > 1e-6);
      if (parts.length) intervals.push({ hole_id: p.hole_id, layer, color, label, from, to, lines: tracePolylines(h.trace, parts) });
      for (const pc of h.pierce || []) if (pc.md >= from && pc.md <= to && !(pc.logs || []).some((l) => l.layer === layer)) (pc.logs = pc.logs || []).push({ label, color, layer });
    }
  }
  return { intervals, legends };
}

// TASKS.csv #2210 (review #2174, WA gold) — rows by hole_id, in their order, so a per-pierce-point lookup scans one hole's rows, not every row
export function groupByHole(rows) {
  const m = new Map();
  for (const r of rows || []) { const a = m.get(r.hole_id); if (a) a.push(r); else m.set(r.hole_id, [r]); }
  return m;
}

// TASKS.csv #2210 — path strings kept per key while the points are the same (a cheap numeric signature of them), for the level plan's
// faint whole-hole traces: they do not move with the RL, and a desurvey change (same frame, moved points) still redraws them
export function pathCache() {
  const m = new Map();
  return (key, pts, toPath) => {
    let sig = pts.length;
    for (const [x, y] of pts) sig = (sig * 31 + x * 7 + y) % 1e12;
    const hit = m.get(key);
    if (hit && hit.sig === sig) return hit.d;
    const d = toPath(pts);
    m.set(key, { sig, d });
    return d;
  };
}

// TASKS.csv #2518 (review #2486) — the level plan opened at the middle of the elevation range (RL 34, which one 577 m hole set; 25 of 2,248
// holes reach it). The RL most holes cross: each hole's trace z-range counted per metre, the middle of the busiest run. holes: [{ trace: [{ z }] }]
// -> an integer RL, or null
export function busiestRl(holes) {
  let lo = Infinity, hi = -Infinity;
  const spans = [];
  for (const h of holes || []) {
    let a = Infinity, b = -Infinity;
    for (const p of h.trace || []) { if (p.z < a) a = p.z; if (p.z > b) b = p.z; }
    if (!(b >= a)) continue;
    spans.push([Math.ceil(a), Math.floor(b)]);
    if (a < lo) lo = a; if (b > hi) hi = b;
  }
  if (!spans.length) return null;
  const z0 = Math.ceil(lo), n = Math.floor(hi) - z0 + 1;
  if (n <= 0) return Math.round((lo + hi) / 2);
  const d = new Int32Array(n + 1);
  for (const [a, b] of spans) if (b >= a) { d[a - z0]++; d[b - z0 + 1]--; }
  let run = 0, best = -1, from = 0, to = 0;
  for (let k = 0; k < n; k++) { run += d[k]; if (run > best) { best = run; from = to = k; } else if (run === best && to === k - 1) to = k; }
  return z0 + Math.round((from + to) / 2);
}
