// TASKS.csv #2640 (Stage 1) — which contacts of a geology model a gravity or magnetic survey can see: what the panel sends the engine
// (python-sidecar/app/geophys/structfit.py, job kind "structfit") and how it reads the answer. Pure: no DOM, no store.
//
// The model is the last GemPy run of this project (store.lastImplicitRequest, lib/gempyInputs.js implicitRequestRecord): its points and
// orientations are in PROJECT coordinates; the engine works in the run's own frame (the project's coordinates less its scene origin), where
// the model's extent already is, so points and stations are moved into it here. The unit numbering is the engine's: id 1 is the space above
// every top (the background), and id k + 1 is the unit whose top is the k-th (non-fault) surface, in the run's order.

// TASKS.csv #3633 (side 5's d09b53cc) — the name the engine knows a surface by: the run's meshName (what the request sent, and what a fault's
// `offsets` lists); the label the panel shows is the record's `name`. Records from before #3633 have no meshName: the label, as always.
export const engineName = (s) => s?.meshName || s?.name;

// TASKS.csv #3633 — whether the record carries what the run sent (its relation, the packages, each fault's offsets, the range multiplier) so the
// pass can rebuild the same model; an older record does not, and the pass assumes each unit erodes the ones below it with GemPy's own range
export const recordIsFull = (record) => !!record && typeof record.relation === "string" && (record.surfaces || []).length > 0 && record.surfaces.every((s) => !!s.meshName);

// the surfaces a point can be moved on (not faults), each with its unit id and its points that may move: interpreted points only — a point
// from a drillhole contact (hole_id) is an observation and never moves
export function movableSurfaces(record) {
  const out = [];
  let unit = 1;
  for (const s of record?.surfaces || []) {
    if (s.fault) continue;
    unit += 1;
    const points = (s.points || []).map((p, index) => ({ index, x: p.x, y: p.y, z: p.z, hole_id: p.hole_id ?? null })).filter((p) => p.hole_id == null);
    out.push({ name: s.name, unit, points, total: (s.points || []).length, fromHoles: (s.points || []).length - points.length });
  }
  return out;
}

// the units to give a property: the background (id 1) and one a non-fault surface
export function propertyUnits(record) {
  const units = [{ id: 1, label: null }];
  let id = 1;
  for (const s of record?.surfaces || []) { if (s.fault) continue; id += 1; units.push({ id, label: s.name }); }
  return units;
}

// why the last run cannot be used, or null
export function modelProblem(record) {
  if (!record) return "Run a geology model in 3D Modelling first: this reads the last model run in this project.";
  if (record.trendFrame) return "The last model was solved with a structural trend, in a warped frame: the survey would have to be warped the same way, which this pass does not do. Run the model without the trend to test its contacts.";
  const n = (record.surfaces || []).filter((s) => !s.fault).length;
  if (n < 1) return "The last model has no surface to move.";
  if (!movableSurfaces(record).some((s) => s.points.length)) return "Every point of the last model comes from a drillhole contact: those are observations and never move. Interpreted points (a map, a section or a pick) can be tested.";
  return null;
}

const num = (v) => { const n = typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v); return Number.isFinite(n) ? n : NaN; };

// the engine's request. { record, method, stations ([[x, y, z]] project coordinates), observed, uncertainty { floor, percent }, field (mag),
// props { unitId: value }, movable [{ surface, index }], maxM, resolve ({ unitId: [lo, hi] } or null) } -> { request } | { problems: [] }
export function buildStructfitRequest({ record, method, stations, observed, uncertainty, field, props, movable, maxM, resolve = null }) {
  const problems = [];
  const mp = modelProblem(record);
  if (mp) return { problems: [mp] };
  if (method !== "grav" && method !== "mag") problems.push("Choose magnetics or gravity.");
  if (!Array.isArray(stations) || !stations.length) problems.push("The survey has no usable stations.");
  if (!(num(uncertainty?.floor) > 0)) problems.push("Enter the data uncertainty floor: it is never assumed.");
  if (!(num(maxM) > 0)) problems.push("Enter the distance each point may move (m): it is never assumed.");
  if (!movable?.length) problems.push("Mark the points to test (up to 20).");
  const units = propertyUnits(record);
  const missing = units.filter((u) => !Number.isFinite(num(props?.[u.id])));
  if (missing.length) problems.push(missing.length === units.length ? "Enter each unit's density or susceptibility, and the background's." : "Enter a value for every unit, the background included.");
  if (method === "grav" && units.some((u) => Number.isFinite(num(props?.[u.id])) && !(num(props[u.id]) >= 1 && num(props[u.id]) <= 6))) problems.push("Densities are in g/cm³ (between 1 and 6): check the values entered.");
  if (resolve) {
    if (observed == null || !Array.isArray(observed) || observed.length !== stations?.length) problems.push("Re-solving the unit values needs the survey's readings.");
    // the background (unit 1) is the reference: kept as entered, no bounds
    if (units.some((u) => u.id > 1 && !(Number.isFinite(num(resolve[u.id]?.[0])) && Number.isFinite(num(resolve[u.id]?.[1])) && num(resolve[u.id][0]) < num(resolve[u.id][1])))) problems.push("To re-solve, enter each unit's lowest and highest value (lowest first); the background stays as entered.");
  }
  if (problems.length) return { problems };
  const o = record.origin || { x: 0, y: 0, z: 0 };
  const inFrame = (p) => ({ x: p.x - o.x, y: p.y - o.y, z: p.z - o.z });
  // TASKS.csv #3633 — the run's own surface names, packages and fault offsets when the record has them
  const full = recordIsFull(record);
  const surfaceOf = (s) => ({
    name: full ? engineName(s) : s.name,
    ...(full && s.package != null ? { package: s.package } : {}), ...(full && s.fault && Array.isArray(s.offsets) ? { offsets: s.offsets } : {}),
    points: (s.points || []).map((p) => ({ ...inFrame(p), ...(Number.isFinite(p.nugget) ? { nugget: p.nugget } : {}), hole_id: p.hole_id ?? null })),
    orientations: (s.orientations || []).map((q) => ({ ...inFrame(q), dip: q.dip, azimuth: q.azimuth })),
  });
  const model = {
    extent: record.extent, resolution: record.resolution, relation: full && record.relation === "onlap" ? "onlap" : "erode",
    ...(full && Number(record.rangeMultiplier) > 0 ? { range_multiplier: Number(record.rangeMultiplier) } : {}),
    ...(full && (record.precision === "float32" || record.precision === "float64") ? { precision: record.precision } : {}),
    surfaces: record.surfaces.filter((s) => !s.fault).map(surfaceOf), faults: record.surfaces.filter((s) => s.fault).map(surfaceOf),
  };
  const request = {
    model, method, stations: stations.map((p) => [p[0] - o.x, p[1] - o.y, p[2] - o.z]),
    ...(Array.isArray(observed) && observed.length === stations.length ? { observed } : {}),
    uncertainty: { floor: num(uncertainty.floor), percent: Number.isFinite(num(uncertainty.percent)) ? num(uncertainty.percent) : 0 },
    properties: Object.fromEntries(units.map((u) => [String(u.id), num(props[u.id])])),
    movable: movable.map((m) => ({ surface: full ? engineName(record.surfaces.find((s) => s.name === m.surface)) || m.surface : m.surface, index: m.index, maxM: num(maxM) })),
    ...(method === "mag" ? { field } : {}),
  };
  if (resolve) request.resolve = Object.fromEntries(Object.entries(resolve).filter(([k]) => Number(k) !== 1).map(([k, v]) => [String(k), [num(v[0]), num(v[1])]]));
  return { request };
}

// every Nth point of a list, at most `limit`, spread over it: [{ surface, index }]
export function everyNth(points, surface, limit = 20) {
  if (!points.length) return [];
  const step = Math.max(1, Math.ceil(points.length / limit));
  return points.filter((_, i) => i % step === 0).slice(0, limit).map((p) => ({ surface, index: p.index }));
}

// the engine's points as table rows in project coordinates: { surface, index, x, y, z, rmsPerM, shiftForOneSigma, verdict }
// TASKS.csv #3632 — the tested points as rows of a geophysics point survey (layers.geophys_pts), so the 3D View draws them with its own colour
// ramp and tooltip: value = log10 of the readings' change per metre the contact moves (in the survey's uncertainty), so the contacts the
// survey sees are the warm end and the ones it cannot constrain the cool end; the verdict rides along as a column. Points with no
// sensitivity number (no contact there) are left out. -> rows
export function verdictPoints(rows, src) {
  return (rows || []).filter((r) => Number.isFinite(r.rmsPerM) && r.rmsPerM > 0 && [r.x, r.y, r.z].every(Number.isFinite)).map((r) => ({
    x: +r.x.toFixed(2), y: +r.y.toFixed(2), z: +r.z.toFixed(2), value: +Math.log10(r.rmsPerM).toFixed(3),
    surface: r.surface, point: r.index + 1, verdict: r.verdict, shift_for_one_sigma_m: r.shiftForOneSigma == null ? "" : +r.shiftForOneSigma.toFixed(2), _src: src,
  }));
}

export function resultRows(result, record) {
  const o = record?.origin || { x: 0, y: 0, z: 0 };
  const label = (n) => (record?.surfaces || []).find((s) => engineName(s) === n)?.name ?? n; // #3633: the engine's meshName back to the label shown
  return (result?.points || []).map((p) => ({
    surface: label(p.surface), index: p.index, x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, maxM: p.maxM, stepM: p.stepM,
    rmsPerM: p.rmsPerM, shiftForOneSigma: p.shiftForOneSigma, bandCells: p.bandCells, note: p.note || null,
    verdict: p.note ? "none" : p.seen ? "seen" : "not constrained",
  }));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// TASKS.csv #2640 Stage 2 — the fit: move the points the survey sees (each within the distance the user typed) until the model's response matches
// the readings to their stated uncertainty (python-sidecar structfit.run_fit, the same job kind with mode 'fit').
export const MAX_FIT_POINTS = 8; // structfit.MAX_FIT_POINTS: each round costs one model solve a point
export const MAX_FIT_ITER = 8;

// the fit's request: the sensitivity request's model, survey and properties, the readings (required: they are what it fits), the points (at most
// MAX_FIT_POINTS, each with its own distance when it has one, else maxM) and the rounds. -> { request } | { problems: [] }
export function buildFitRequest(args, { maxIter = 6 } = {}) {
  const problems = [];
  if (!Array.isArray(args?.observed) || args.observed.length !== args?.stations?.length) problems.push("The fit needs the survey's readings: it moves the points until the model matches them.");
  if ((args?.movable || []).length > MAX_FIT_POINTS) problems.push(`The fit moves at most ${MAX_FIT_POINTS} points: mark the ones the sensitivity pass says the survey sees.`);
  const built = buildStructfitRequest(args);
  if (built.problems) return { problems: [...problems, ...built.problems] };
  if (problems.length) return { problems };
  const own = new Map((args.movable || []).map((m) => [`${m.surface}|${m.index}`, num(m.maxM)]));
  const request = {
    ...built.request, mode: "fit", maxIter: Math.max(1, Math.min(MAX_FIT_ITER, Math.round(Number(maxIter) || 6))),
    movable: built.request.movable.map((m, k) => { const mine = own.get(`${args.movable[k].surface}|${args.movable[k].index}`); return Number.isFinite(mine) && mine > 0 ? { ...m, maxM: mine } : m; }),
  };
  return { request };
}

// the fit's points as rows in project coordinates, the engine's names back to the labels: { surface, index, x, y, zStart, z, movedM, maxM, constrained, perM }
export function fitRows(result, record) {
  const o = record?.origin || { x: 0, y: 0, z: 0 };
  const label = (n) => (record?.surfaces || []).find((s) => engineName(s) === n)?.name ?? n;
  return (result?.points || []).map((p) => ({
    surface: label(p.surface), index: p.index, x: p.x + o.x, y: p.y + o.y, zStart: p.zStart + o.z, z: p.z + o.z, movedM: p.movedM, maxM: p.maxM,
    constrained: !!p.constrained, perM: p.perM ?? null, atLimit: Math.abs(Math.abs(p.movedM) - p.maxM) < 1e-6 && p.maxM > 0,
  }));
}

// why the fit stopped, in words (the panel translates them)
export const FIT_STOPPED = {
  fit: "Fits the survey to its stated uncertainty.",
  "no improvement": "Stopped: the misfit no longer fell by 1 % a round.",
  "max iterations": "Stopped after the rounds allowed.",
  "no step kept": "Stopped: no step lowered the misfit while keeping every drillhole contact and the units that touch.",
  "no point is constrained": "Nothing moved: the survey cannot move its readings by one uncertainty with any of these points within its distance.",
};

// the moved points for audit (a CSV a model can be rebuilt from): surface, point, x, y, z before and after, metres moved, the distance allowed, constrained
export function fitPointsCsv(rows) {
  const q = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "");
  return ["surface,point,x,y,z_start,z_fitted,moved_m,max_m,constrained", ...(rows || []).map((r) => [q(r.surface), r.index + 1, f(r.x), f(r.y), f(r.zStart), f(r.z), f(r.movedM), f(r.maxM), r.constrained ? "yes" : "no"].join(","))].join("\n") + "\n";
}

// the record with the fitted heights (project coordinates): the model the fit found, to run again at full resolution as a version of its own
export function recordWithFit(record, rows) {
  if (!record) return null;
  const at = new Map((rows || []).filter((r) => r.constrained && Number.isFinite(r.z)).map((r) => [`${r.surface}|${r.index}`, r.z]));
  return { ...record, fittedFrom: record.at || null, surfaces: (record.surfaces || []).map((s) => ({ ...s, points: (s.points || []).map((p, i) => (at.has(`${s.name}|${i}`) ? { ...p, z: at.get(`${s.name}|${i}`) } : p)) })) };
}
