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

export const PLAN_HOLE_STEP = 400, PLAN_ROW_STEP = 15000;

// the per-hole trace (E / N / z with md) and its ~200-point context line, kept per hole; the cache resets when the traces, the shown holes
// or the layer primitives' inputs change
function cacheOf(ctx) {
  let pc = ctx.cache.current;
  if (!pc || pc.fn !== ctx.layerPrimitivesFor || pc.traces !== ctx.traces || pc.vh !== ctx.visibleHoles) {
    pc = ctx.cache.current = { fn: ctx.layerPrimitivesFor, traces: ctx.traces, vh: ctx.visibleHoles, base: new Map(), prims: null, ivBy: null, ptBy: null };
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
    const all = new Set(traces.filter((t) => visibleHoles[t.hole_id] !== false).map((t) => t.hole_id)), prims = ctx.layerPrimitivesFor(all, {});
    pc.prims = prims; pc.ivBy = groupByHole(prims.intervals); pc.ptBy = groupByHole(prims.points.filter((pt) => pt.assay));
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
  const { ivBy, ptBy } = pc; // #2982
  k = 0;
  for (const h of holes) {
    if (++k % PLAN_HOLE_STEP === 0) yield 0.8 + (0.1 * k) / holes.length;
    for (const p of h.pierce) {
      p.logs = (ivBy.get(h.hole_id) || []).filter((iv) => p.md >= iv.from && p.md <= iv.to).map((iv) => ({ label: iv.label, color: iv.color, layer: iv.layer }));
      p.assays = (ptBy.get(h.hole_id) || []).filter((pt) => p.md >= pt.assay.from && p.md <= pt.assay.to).map((pt) => pt.label);
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
  return { rl, half, holes, intervals: [...planIntervals, ...pa.intervals], assayLegends: pa.legends, points: planPoints, structures, voxelSlices, surfaceCuts, planned, legendItems };
}

// all at once (tests, and a caller that needs the plan now)
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
