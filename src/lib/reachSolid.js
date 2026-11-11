// TASKS.csv #2422 (review #2325, WA uranium) — 'Restrict to a modelled volume' keeps only the samples inside the solid, so the
// estimate reaches only the blocks within the search of those samples; the dialog still counted the blocks within reach of EVERY
// trace in the solid's box (797,492 at 10 m for a shell whose run kept 3,702) and refused the run. This gives the reach count the
// parts of the traces inside the solid: each trace segment sampled every `step`, runs of inside samples kept as sub-segments, with a
// margin of one step (a point inside lies within a step of an inside sample), so the count stays a superset of the samples' reach.
// Kept out of lib/blockReach.js so the estimation worker, which imports that file, does not load the mesh code.
import { buildMeshQuery, isPointInsideMesh } from "./meshQuery.js";
import { simplifyTrace } from "./blockReach.js";

let cached = { key: null, query: null };
// solid: { key, positions, indices } (positions / indices may be left out once this key was built: the worker keeps the last one)
export function solidQuery(solid) {
  if (!solid) return null;
  if (cached.key != null && cached.key === solid.key && cached.query) return cached.query;
  if (!solid.positions || !solid.indices) return null;
  cached = { key: solid.key, query: buildMeshQuery(solid.positions, solid.indices) };
  return cached.query;
}

// traces: [[{x, y, z}]] -> { segments: [[ax, ay, az, bx, by, bz]], margin, inside: samples inside, samples: all samples }
// #2636 — tol: the traces are simplified to within tol first (Douglas-Peucker, as the unrestricted count), and the margin grows by it
export function clipTracesToSolid(traces, query, step, tol = 0) {
  const h = Math.max(1e-3, step), segments = [];
  let inside = 0, samples = 0;
  for (const t0 of traces || []) {
    const t = simplifyTrace(t0, tol);
    for (let i = 0; i + 1 < (t?.length || 0); i++) {
      const a = t[i], b = t[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / h));
      let runStart = -1;
      for (let k = 0; k <= n + 1; k++) {
        const isIn = k <= n && (() => { const f = k / n; return isPointInsideMesh(query, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }); })();
        if (k <= n) { samples++; if (isIn) inside++; }
        if (isIn && runStart < 0) runStart = k;
        if (!isIn && runStart >= 0) {
          const f0 = runStart / n, f1 = (k - 1) / n;
          segments.push([a.x + (b.x - a.x) * f0, a.y + (b.y - a.y) * f0, a.z + (b.z - a.z) * f0, a.x + (b.x - a.x) * f1, a.y + (b.y - a.y) * f1, a.z + (b.z - a.z) * f1]);
          runStart = -1;
        }
      }
    }
  }
  return { segments, margin: h + Math.max(0, tol), inside, samples };
}

// the reach worker's (and its main-thread fallback's) answer: the trace parts inside args.solid when one is given, else the traces
export function reachArgsWithSolid(args) {
  if (!args?.solid) return args;
  const q = solidQuery(args.solid);
  if (!q) throw new Error("The restricting solid could not be read.");
  const step = Math.min(args.cell3.dx, args.cell3.dy, args.cell3.dz, args.radius) / 2;
  const c = clipTracesToSolid(args.traces, q, step, Math.min(args.cell3.dx, args.cell3.dy, args.cell3.dz) / 4);
  const { solid: _solid, ...rest } = args;
  return { ...rest, segments: c.segments, margin: c.margin };
}
