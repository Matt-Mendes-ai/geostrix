// TASKS.csv #3137 (the rest of #3064 / #2982, WA iron) — the level plan's build, moved out of ViewerModule (#525's buildPlanPayload) and
// run a slice at a time. Measured on WA iron (6,390 holes, ~150,000 intervals, ~148,000 assays): one open blocked ~2.0 s in the build (the
// busiest-RL pick, a full build, 0.9 s; the plan 1.2 s: the interval clip 0.7 s over both, layerPrimitivesFor 0.5 s the first time, the
// trace polylines 0.3 s) besides the window's own drawing. Now:
// - the busiest-RL pick reads the holes only (busiestRl needs each trace's z, not the slab's logs, points, structures or models);
// - the build is a generator that pauses every PLAN_HOLE_STEP holes and PLAN_ROW_STEP rows, driven in short slices by runSliced, so the
//   window paints and says how far it is; a newer RL cancels the build under way (LevelPlanWindow);
// - it loads with the window (LevelPlanWindow's chunk), not at startup (#3159).
// ctx: what the build reads from the 3D view, as ViewerModule's planCtx() gives it (data and its resolvers: colours, labels, filters).
// What the RL does not change (each hole's trace, the layers' primitives) is kept in ctx.cache (#2982) until the view's inputs change.
import { slabRuns, piercePoints, tracePolylines, pointAtMd, voxelPlanRects, meshPlanCut, planAssayLayers, groupByHole } from "../../lib/levelPlan.js";
import { t as tr } from "../../lib/i18n.js";

export const PLAN_HOLE_STEP = 400, PLAN_ROW_STEP = 15000;

// the per-hole trace (E / N / z with md) and its ~200-point context line, kept per hole; the cache resets when the traces, the shown holes
// or the layer primitives' inputs change
function cacheOf(ctx) {
  let pc = ctx.cache.current;
  const also = (ctx.also || []).join("|"); // #3248
  if (!pc || pc.fn !== ctx.layerPrimitivesFor || pc.traces !== ctx.traces || pc.vh !== ctx.visibleHoles || pc.also !== also) {
    pc = ctx.cache.current = { fn: ctx.layerPrimitivesFor, traces: ctx.traces, vh: ctx.visibleHoles, also, base: new Map(), prims: null, ivBy: null, ptBy: null, rdBy: null };
  }
  return pc;
}
function baseOf(pc, t) {
  let b = pc.base.get(t.hole_id);
  if (!b) {
    const tr0 = t.pts.map((p, i) => ({ md: p.md, x: t.wx[i], y: t.wy[i], z: t.wz[i] })), k = Math.max(1, Math.floor(tr0.length / 200)); // context: thinned to ~200 points
    pc.base.set(t.hole_id, (b = { trace: tr0, context: tr0.filter((_, i) => i % k === 0 || i === tr0.length - 1).map((p) => [p.x, p.y]) }));
  }
  return b;
}

// -> yields a progress fraction (0-1) now and then; returns the plan { rl, half, holes, intervals, assayLegends, points, structures,
// voxelSlices, surfaceCuts, planned, legendItems }, or with holesOnly { holes: [{ hole_id, trace }] } (what busiestRl reads)
export function* planBuild(ctx, rl, half, { holesOnly = false } = {}) {
  const { traces, visibleHoles } = ctx;
  const zmin = rl - half, zmax = rl + half, holes = [], pc = cacheOf(ctx);
  let k = 0;
  if (holesOnly) {
    for (const t of traces) {
      if (visibleHoles[t.hole_id] === false) continue; // #1533
      if (++k % PLAN_HOLE_STEP === 0) yield (0.9 * k) / traces.length;
      const { trace } = baseOf(pc, t);
      if (trace.length) holes.push({ hole_id: t.hole_id, trace });
    }
    return { holes };
  }
  if (!pc.prims) { // #2982 — the layers' primitives over the shown holes (SG scaled over them), once per view state
    const all = new Set(traces.filter((t) => visibleHoles[t.hole_id] !== false).map((t) => t.hole_id)), prims = ctx.layerPrimitivesFor(all, ctx.also?.length ? { also: ctx.also } : {}); // #3248 — and a layer hidden in 3D the plan is coloured by
    pc.prims = prims; pc.ivBy = groupByHole(prims.intervals.filter((iv) => !(iv.to - iv.from < 1e-6))); pc.ptBy = groupByHole(prims.points.filter((pt) => pt.assay));
    pc.rdBy = groupByHole(readingsOf(prims)); // #1706
    yield 0.15;
  }
  for (const t of traces) {
    if (visibleHoles[t.hole_id] === false) continue; // #1533
    if (++k % PLAN_HOLE_STEP === 0) yield 0.15 + (0.25 * k) / traces.length;
    const { trace, context } = baseOf(pc, t);
    if (!trace.length) continue;
    const runs = slabRuns(trace, zmin, zmax);
    holes.push({ hole_id: t.hole_id, trace, runs, polylines: tracePolylines(trace, runs), pierce: piercePoints(trace, rl), collar: [trace[0].x, trace[0].y], context });
  }
  const inSlab = holes.filter((h) => h.runs.length);
  const holeIds = new Set(inSlab.map((h) => h.hole_id));
  const intervals = pc.prims.intervals.filter((iv) => holeIds.has(iv.hole_id)), points = pc.prims.points.filter((pt) => holeIds.has(pt.hole_id)); // #2982
  const byId = new Map(holes.map((h) => [h.hole_id, h]));
  const clip = (h, from, to) => h.runs.map(([r0, r1]) => [Math.max(from, r0), Math.min(to, r1)]).filter(([f, t]) => t - f > 1e-6);
  const planIntervals = [];
  k = 0;
  for (const iv of intervals) {
    if (++k % PLAN_ROW_STEP === 0) yield 0.4 + (0.3 * k) / intervals.length;
    const h = byId.get(iv.hole_id); if (!h) continue;
    const parts = clip(h, iv.from, iv.to);
    if (parts.length) planIntervals.push({ hole_id: iv.hole_id, layer: iv.layer, color: iv.color, label: iv.label, from: iv.from, to: iv.to, lines: tracePolylines(h.trace, parts) });
  }
  const planPoints = [];
  k = 0;
  for (const pt of points) {
    if (++k % PLAN_ROW_STEP === 0) yield 0.7 + (0.1 * k) / points.length;
    const h = byId.get(pt.hole_id); if (!h) continue;
    const md = pt.assay ? (pt.assay.from + pt.assay.to) / 2 : pt.md;
    if (!h.runs.some(([a, b]) => md >= a - 1e-9 && md <= b + 1e-9)) continue;
    const q = pointAtMd(h.trace, md);
    planPoints.push({ hole_id: pt.hole_id, md, x: q.x, y: q.y, color: pt.color, label: pt.label, assay: pt.assay || null });
  }
  // what each pierce point sits in: the interval of every logged layer at that depth, and the assays there
  // #2210 — rows grouped by hole (a filter per pierce point was ~200 ms on WA gold)
  const { ivBy, ptBy, rdBy } = pc, pointLogs = []; // #2982
  k = 0;
  for (const h of holes) {
    if (++k % PLAN_HOLE_STEP === 0) yield 0.8 + (0.1 * k) / holes.length;
    for (const p of h.pierce) {
      p.logs = (ivBy.get(h.hole_id) || []).filter((iv) => p.md >= iv.from && p.md <= iv.to).map((iv) => ({ label: iv.label, color: iv.color, layer: iv.layer }));
      p.assays = (ptBy.get(h.hole_id) || []).filter((pt) => p.md >= pt.assay.from && p.md <= pt.assay.to).map((pt) => pt.label);
      for (const r of nearestReadings(rdBy.get(h.hole_id), h.runs, p.md)) { // #1706
        if (p.logs.some((l) => l.layer === r.layer)) continue; // a logged interval there wins (a mineralization interval)
        p.logs.push({ label: `${r.label} (${f1(r.md)} m)`, color: r.color, layer: r.layer });
        pointLogs.push({ layer: r.layer, label: r.label, color: r.color });
      }
    }
  }
  const structures = [];
  if (ctx.layerVisible.structure) {
    k = 0;
    for (const sp of ctx.layers.structure || []) {
      if (++k % PLAN_ROW_STEP === 0) yield 0.9;
      const h = byId.get(sp.hole_id);
      if (!h || !ctx.isRowVisible("structure", sp) || !h.runs.some(([a, b]) => sp.depth >= a && sp.depth <= b)) continue;
      const q = pointAtMd(h.trace, Number(sp.depth));
      const oriented = Number.isFinite(Number(sp.dip)) && Number.isFinite(Number(sp.azimuth)) && sp.dip !== null && sp.azimuth !== null;
      structures.push({ hole_id: sp.hole_id, depth: sp.depth, x: q.x, y: q.y, dip: oriented ? Number(sp.dip) : null, dipDir: oriented ? Number(sp.azimuth) : null, color: ctx.effectiveColor("structure", sp.value), label: `Structure: ${ctx.effectiveLabel("structure", sp.value)}` });
    }
  }
  yield 0.92;
  const voxelSlices = [];
  (ctx.voxelModels || []).forEach((model) => {
    if (!model.cells?.length || model.visible === false) return;
    const rects = voxelPlanRects(model.cells.filter((c) => ctx.voxelCellShown(model, c)), rl).map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, color: ctx.colorForVoxelValue(model, r.value) }));
    if (rects.length) voxelSlices.push({ id: model.id, name: model.name, rects });
  });
  yield 0.95;
  const surfaceCuts = [];
  {
    const o = ctx.origin;
    const nameOf = Object.fromEntries((ctx.implicitSurfaces || []).map((sf) => [sf.id, sf.name]));
    Object.entries(ctx.implicitMeshes || {}).forEach(([id, mesh]) => {
      if (!mesh?.visible || !mesh.geometry?.attributes?.position) return;
      const pos = mesh.geometry.attributes.position.array, n = pos.length / 3;
      const tris = mesh.geometry.index ? mesh.geometry.index.array : Uint32Array.from({ length: n }, (_, i) => i);
      // scene -> world: E = x + ox, N = oy - z, Z = y + oz (as the section cut)
      const segs = meshPlanCut(n, tris, (i) => ({ x: pos[i * 3] + o.x, y: o.y - pos[i * 3 + 2], z: pos[i * 3 + 1] + o.z }), rl);
      if (segs.length) surfaceCuts.push({ id, name: nameOf[id] || String(mesh.userData?.tip || id).split("\n")[0], color: `#${(mesh.material?.color?.getHex?.() ?? 0xc8a24a).toString(16).padStart(6, "0")}`, segs });
    });
  }
  const planned = [];
  (ctx.plannedHoles || []).forEach((ph) => {
    const tr = ctx.plannedHoleTrace(ph);
    if (!tr?.length) return;
    const runs = slabRuns(tr, zmin, zmax), pierce = piercePoints(tr, rl);
    planned.push({ name: ph.name || ph.id, collar: [tr[0].x, tr[0].y], lines: tracePolylines(tr, runs), pierce, context: tr.map((p) => [p.x, p.y]) });
  });
  yield 0.97;
  const legendSeen = new Set(), legendItems = [];
  [...planIntervals, ...structures].forEach((r) => { const key = `${r.label}|${r.color}`; if (!legendSeen.has(key) && !/^(Geotech|Recovery|Specific gravity)/.test(r.label)) { legendSeen.add(key); legendItems.push([r.label, r.color]); } });
  legendItems.sort((a, b) => a[0].localeCompare(b[0]));
  const pa = planAssayLayers(points, holes, ctx.assayLegend(), ctx.projectValues); // #1537
  return { rl, half, holes, intervals: [...planIntervals, ...pa.intervals], assayLegends: pa.legends, points: highestOnSpot(planPoints), pointLogs, /* #3249 */ structures, voxelSlices, surfaceCuts, planned, legendItems };
}

// TASKS.csv #1706 (review #1645, Copley) — 'Colour holes by' offered the interval logs and (#1537) the assay elements, never a log read at
// a depth: Mag. susc., Mineralization points, a custom point layer (SWIR / TSA minerals, regolith events) or a downhole log stored as
// zero-length intervals (#2884's Density_Best, Gamma_Best). A pierce point now takes each such layer's reading nearest it along the hole
// within the slab (pointLogs: one row per fill, for the choice and the legend), and its hover gives that reading's depth. Zero-length
// rows fill pierce points only: drawn as dots they would be ~150,000 circles on WA iron.
// -> [{ hole_id, md, layer, label, color }]
function readingsOf(prims) {
  const out = [];
  for (const pt of prims.points) if (pt.layer && !pt.assay) out.push({ hole_id: pt.hole_id, md: pt.md, layer: pt.layer, label: pt.label, color: pt.color });
  for (const iv of prims.intervals) if (iv.to - iv.from < 1e-6) out.push({ hole_id: iv.hole_id, md: iv.from, layer: iv.layer, label: iv.label, color: iv.color });
  return out;
}
// each layer's reading nearest md, among one hole's readings inside the slab runs
export function nearestReadings(rows, runs, md) {
  if (!rows?.length || !runs?.length) return [];
  const best = new Map();
  for (const r of rows) {
    if (!runs.some(([a, b]) => r.md >= a - 1e-9 && r.md <= b + 1e-9)) continue;
    const d = Math.abs(r.md - md), b = best.get(r.layer);
    if (!b || d < b.d) best.set(r.layer, { d, r });
  }
  return [...best.values()].map((b) => b.r);
}
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

// all at once (tests, and a caller that needs the plan now)
// TASKS.csv #3249 — a vertical (or steep) hole puts a slab's samples of one element on one spot of the plan, and whichever was drawn last
// showed. One stated rule: one hole's samples of one element within 0.5 m of each other on the plan show as the highest of them, its tooltip
// saying so; other points (logs at a depth) as they are. Order kept (the first of each spot).
export function highestOnSpot(points, tol = 0.5) {
  const out = [], spots = new Map();
  for (const p of points) {
    if (!p.assay || !Number.isFinite(p.assay.value)) { out.push(p); continue; }
    const k = `${p.hole_id}|${p.assay.sym}`, list = spots.get(k) || spots.set(k, []).get(k);
    const s = list.find((q) => Math.abs(q.p.x - p.x) <= tol && Math.abs(q.p.y - p.y) <= tol);
    if (!s) { const e = { p, n: 1, at: out.length }; list.push(e); out.push(p); continue; }
    s.n++;
    if (p.assay.value > s.p.assay.value) s.p = p;
    out[s.at] = s.p;
  }
  for (const list of spots.values()) for (const s of list) if (s.n > 1) out[s.at] = { ...s.p, label: `${s.p.label} ${tr("(highest of {n} in the slab)", { n: s.n })}` };
  return out;
}

// TASKS.csv #3248 — the logged layers hidden in the 3D View that have rows (a model layer such as Strat unit), offered greyed by the plan's
// 'Colour holes by': picking one builds the plan with it, the 3D View unchanged. -> [{ key, label }]
const PLAN_LAYER_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "geotech", "recovery", "sg", "litho_gc", "alt_gc", "mnlgy", "magsusc"];
export function hiddenPlanLayers(ctx, meta) {
  const out = [];
  for (const k of PLAN_LAYER_KEYS) if (!ctx.layerVisible?.[k] && (ctx.layers?.[k] || []).length) out.push({ key: k, label: meta[k]?.label || k });
  for (const l of ctx.customLayers || []) if (ctx.customVisible?.[l.id] === false && (l.rows || []).length) out.push({ key: `custom:${l.id}`, label: String(l.name) });
  return out;
}

export function planBuildNow(ctx, rl, half, opts) { const g = planBuild(ctx, rl, half, opts); let r = g.next(); while (!r.done) r = g.next(); return r.value; }

// a generator run in short slices between macrotasks: onProgress(the last value yielded), cancelled() -> true stops it (resolves null)
export function runSliced(gen, { sliceMs = 12, onProgress = null, cancelled = () => false } = {}) {
  return new Promise((resolve, reject) => {
    const slice = () => {
      if (cancelled()) { resolve(null); return; }
      try {
        const end = performance.now() + sliceMs;
        let r;
        do { r = gen.next(); } while (!r.done && performance.now() < end);
        if (r.done) { resolve(r.value); return; }
        if (r.value != null) onProgress?.(r.value);
        setTimeout(slice, 0);
      } catch (e) { reject(e); }
    };
    setTimeout(slice, 0);
  });
}
