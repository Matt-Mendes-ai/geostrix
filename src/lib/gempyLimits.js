// TASKS.csv #3162 — the GemPy engine's own bounds on one model (python-sidecar/app/main.py ImplicitModelRequest: surfaces max_length,
// faults max_length), from the security hardening (fe73b024). The app had no matching check: a 13-unit Model from map stack (Mount
// Raymond) went to the engine and came back as its raw validation text. Raised to 16 units (Mount Raymond's map has 13 tops), not 24:
// an erosional stack is one solve per unit, and a 24-unit test (Mount Raymond's tops split, 1,426 points) passed 40 minutes against 16
// at 12 units on a busy CPU (its splits also added orientations, so that overstates it).
// Keep these equal to main.py's (test/gempyLimits3162 reads both).
export const GEMPY_MAX_SURFACES = 16;
export const GEMPY_MAX_FAULTS = 6;

// the engine's list-length refusal ("surfaces: List should have at most 12 items after validation, not 13") in words; other text unchanged.
// The runs check the counts first; this is for an engine with other bounds (an older or newer sidecar).
export function plainEngineError(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(?:request\.)?(surfaces|faults)(?:\.\d+)?: List should have at most (\d+) items? after validation, not (\d+)/g,
    (_, what, max, n) => `The modelling engine takes at most ${max} ${what === "faults" ? "faults" : "units"} in one model, and this one has ${n}`);
}

// TASKS.csv #3162 — Model from map samples the map's contacts every MAP_CONTACT_STEP_M on the terrain. On Mount Raymond's 24 x 30 km sheet
// that gave 15,334 points, and GemPy's memory grows with the square of the points (the interpolation's matrix): the run passed 13.5 GB
// in five minutes without finishing. Over MAP_POINT_BUDGET the step is lengthened to keep about that many points (on Mount Raymond about
// 95 m, finer than its 250 m model cells); a small map keeps the 25 m step. Measured live at the budget (Mount Raymond, 4,016 points,
// 262 orientations, 13 tops): the engine's peak 3.7 GB, so a 16 GB computer has room to spare. Its TIME on a sheet that size is the
// field's evaluation, not the points' memory: over the app's 15 minutes on a busy CPU (see the TASKS row).
export const MAP_CONTACT_STEP_M = 25;
export const MAP_POINT_BUDGET = 4000;
// lengthM: the summed length of the contact lines in use, times the tops each gives points to -> the step (m)
export const mapContactStep = (lengthM, budget = MAP_POINT_BUDGET) => (lengthM / MAP_CONTACT_STEP_M > budget ? Math.ceil(lengthM / budget) : MAP_CONTACT_STEP_M);

// specs: the run's surfaces ({ fault }) -> null, or { surfaces, faults, maxSurfaces, maxFaults, overSurfaces, overFaults }
export function gempyLimitCheck(specs) {
  let surfaces = 0, faults = 0;
  for (const s of specs || []) if (s?.fault) faults++; else surfaces++;
  const overSurfaces = surfaces > GEMPY_MAX_SURFACES, overFaults = faults > GEMPY_MAX_FAULTS;
  return overSurfaces || overFaults ? { surfaces, faults, maxSurfaces: GEMPY_MAX_SURFACES, maxFaults: GEMPY_MAX_FAULTS, overSurfaces, overFaults } : null;
}

// TASKS.csv #3162 follow-up (Main, 2026-11-13: Matt's Mount Raymond run still did not finish) — GemPy's TIME. Measured with stage timers in
// gempy_engine (2026.0.3) on Mount Raymond's request, 13 tops: the time is the field evaluated at grid points, each against every data
// row (a contact point is one row, an orientation three), in two parts:
//  - the lithology block (the Resolution slider's ~n^3 cells) and the model check / map points (evaluate_at): about 2.1 us per point-row;
//  - the meshes: dual contouring evaluates the field and its gradient on the octree's crossed edges, about 5,000 edges per surface of the
//    field at the standard octree (16 cells a side, whatever the sheet's size), about 6.6 us per edge-row (3x a block point).
// 318 points / 60 orientations: 293 s (dual contouring 211 s, the block 49 s); with 6 surfaces its edges halved; one octree level less
// cut the meshes 4.8x but left 1.5-1.9 km mesh cells 5x coarser, so that is not the lever. 410 points / 88 orientations with the block
// and 19,812 check points: 350 s, against 4,016 / 262 that passed 15 minutes. The model in "evaluations" (block-point-rows) below
// predicted those parts within 10 %. Those runs were on a CPU at 100 % from other work, standing in for a modest computer.
export const GEMPY_EDGE_EVALS_PER_SURFACE = 15000; // ~5,000 edges a surface x 3 (the gradient's cost against a block point)
export const GEMPY_WORK_BUDGET = 150e6; // about five minutes measured as above (2.1 us an evaluation)

const oriKey = (o) => `${o.x},${o.y},${o.z},${o.dip},${o.azimuth}`;
// the fields GemPy solves one by one: onlap one shared field, erode one per surface, packages (#1309) one per package; faults one each
function fieldsOf(specs, relation) {
  const fields = new Map();
  specs.forEach((s, i) => {
    const k = s.fault ? `f${i}` : s.package != null ? `p${s.package}` : relation === "onlap" ? "stack" : `s${i}`;
    if (!fields.has(k)) fields.set(k, []);
    fields.get(k).push(s);
  });
  return [...fields.values()];
}
// the data rows of one field (an onlap field takes a repeated orientation once: main.py's _dedupe_onlap_orientations)
const fieldRows = (f, oris = (s) => s.orientations) => {
  const keys = new Set(), pts = f.reduce((n, s) => n + s.points.length, 0);
  let o = 0;
  for (const s of f) for (const q of oris(s)) { if (f.length > 1) keys.add(oriKey(q)); else o++; }
  return pts + 3 * (f.length > 1 ? keys.size : o);
};
// specs: the run's surfaces ({ points, orientations, fault, package }) -> the evaluations GemPy does (see above)
export function gempyWork(specs, { blockCells, evalPts = 0, relation = "erode" }) {
  return fieldsOf(specs, relation).reduce((w, f) => w + fieldRows(f) * (blockCells + evalPts + GEMPY_EDGE_EVALS_PER_SURFACE * f.length), 0);
}
// k of n spread evenly through the list (contact points come in order along the map's lines)
const spread = (arr, k) => (k >= arr.length ? arr : Array.from({ length: Math.max(0, k) }, (_, i) => arr[Math.floor((i * arr.length) / k)]));

// A Model from map run over the work budget: the map's contact points and its orientations thinned evenly so the run fits it. The
// orientations keep the larger share (1 in sqrt(f) where f is the overshoot): on a map they carry the dip that contacts traced on the
// ground hardly give. A logged contact in a hole (hole_id) is always kept, and faults are left as they are. Every surface keeps 3 points.
// -> null (within the budget) or { specs, before: { points, orientations }, after: { points, orientations }, work, workAfter }
export function thinForWork(specs, opts) {
  const budget = opts.budget ?? GEMPY_WORK_BUDGET;
  const work = gempyWork(specs, opts);
  if (!(work > budget)) return null;
  const fields = fieldsOf(specs, opts.relation || "erode");
  const per = (f) => opts.blockCells + (opts.evalPts || 0) + GEMPY_EDGE_EVALS_PER_SURFACE * f.length;
  const mapOf = (f) => (f[0].fault ? 0 : f.reduce((n, s) => n + s.points.filter((q) => q.hole_id == null).length, 0));
  // the orientations at 1 in fo, and the work of everything but the map's points (the orientations, held points, faults)
  const plan = (fo) => {
    const memo = new Map(); // the same list on several surfaces is thinned once, so an onlap field still sees one set
    const thinOri = (list) => { if (!memo.has(list)) memo.set(list, spread(list, Math.max(1, Math.ceil(list.length / fo)))); return memo.get(list); };
    let fixed = 0, mapW = 0, oriW = 0;
    for (const f of fields) {
      const c = per(f), thinnable = !f[0].fault, m = mapOf(f);
      const rows = fieldRows(f, thinnable ? (s) => thinOri(s.orientations) : (s) => s.orientations);
      fixed += c * (rows - m); mapW += c * m;
      if (thinnable) oriW += c * (rows - f.reduce((n, s) => n + s.points.length, 0));
    }
    return { thinOri, fixed, mapW, oriW };
  };
  let fo = Math.sqrt(work / budget), P = plan(fo);
  // an erosional stack sends the map's measurements to every surface's own field: they may not take more than half the budget
  if (P.oriW > budget / 2) { fo *= P.oriW / (budget / 2); P = plan(fo); }
  const { thinOri, fixed, mapW } = P;
  const keepShare = mapW > 0 ? Math.max(0, Math.min(1, (budget - fixed) / mapW)) : 1;
  const out = specs.map((s) => {
    if (s.fault) return s;
    const held = s.points.filter((q) => q.hole_id != null), map = s.points.filter((q) => q.hole_id == null);
    const keep = Math.max(Math.min(map.length, Math.max(0, 3 - held.length)), Math.ceil(map.length * keepShare));
    return { ...s, points: [...spread(map, keep), ...held], orientations: thinOri(s.orientations) };
  });
  const count = (list) => ({ points: list.filter((s) => !s.fault).reduce((n, s) => n + s.points.length, 0), orientations: new Set(list.filter((s) => !s.fault).flatMap((s) => s.orientations.map(oriKey))).size });
  return { specs: out, before: count(specs), after: count(out), work, workAfter: gempyWork(out, opts) };
}
