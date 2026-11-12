// TASKS.csv #2550 (review #2486, WA lithium) — one density for the whole model: fresh pegmatite (about 2.7) and clay-weathered rock (1.8-2.0)
// took the same, on a project with a Weathering layer. Each block takes the code of the nearest logged interval of a chosen layer (its
// interval midpoints, desurveyed, within maxDistM) and that code's density; a block with no code within reach, or a code with no density
// typed, takes the default. Pure.
import { desurveyHole } from "./desurvey.js"; // TASKS.csv #2647 — layerCodeLookup places the intervals

// points [{ x, y, z, code }] -> (cell) => code | null, the nearest point within maxDistM (a 3D grid of maxDistM bins)
export function nearestCodeLookup(points, maxDistM) {
  const R = Number(maxDistM);
  if (!(R > 0) || !points?.length) return () => null;
  const O = 131072, p0 = points[0], bx0 = Math.floor(p0.x / R), by0 = Math.floor(p0.y / R), bz0 = Math.floor(p0.z / R);
  const key = (i, j, k) => ((i - bx0 + O) * 262144 + (j - by0 + O)) * 262144 + (k - bz0 + O);
  const bins = new Map();
  for (const p of points) { const k = key(Math.floor(p.x / R), Math.floor(p.y / R), Math.floor(p.z / R)); const l = bins.get(k); if (l) l.push(p); else bins.set(k, [p]); }
  const R2 = R * R;
  return (c) => {
    const i0 = Math.floor(c.x / R), j0 = Math.floor(c.y / R), k0 = Math.floor(c.z / R);
    let best = R2 + 1e-9, code = null;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      for (const p of bins.get(key(i, j, k)) || []) { const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; code = p.code; } }
    }
    return code;
  };
}

// densities { code: t/m3 }, fallback t/m3 -> (cell) => t/m3 | null; also counts which density each block took (for the line under the table)
export function densityByCode(codeOf, densities, fallback) {
  const def = Number(fallback) > 0 ? Number(fallback) : null;
  const used = new Map();
  const of = (c) => {
    const code = codeOf(c);
    const d = code != null && Number(densities?.[code]) > 0 ? Number(densities[code]) : def;
    const k = code != null && Number(densities?.[code]) > 0 ? code : "(default)";
    used.set(k, (used.get(k) || 0) + 1);
    return d;
  };
  return { of, used };
}

// trace [{ md, x, y, z }] (desurveyHole), the md ascending -> the interval [from, to) as points every stepM, each { x, y, z, code }
export function intervalCodePoints(trace, from, to, code, stepM) {
  const out = [], f = Number(from), t = Number(to), st = Math.max(0.5, Number(stepM) || 2);
  if (!trace?.length || !(t > f)) return out;
  let i = 0;
  for (let d = f + Math.min(st, t - f) / 2; d < t; d += st) {
    while (i < trace.length - 2 && trace[i + 1].md < d) i++;
    const a = trace[i], b = trace[Math.min(i + 1, trace.length - 1)], span = b.md - a.md;
    const k = span > 0 ? Math.min(1, Math.max(0, (d - a.md) / span)) : 0;
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, code });
  }
  return out;
}

// TASKS.csv #2647 (follow-up of #2437) — the same per-code density for the pit tools (Pit shell, Nested pits, Pit design), built from the
// logged layer the pit's inputs name. rows: the layer's intervals; cellMax: the largest block side. -> { codeOf, reachM } or null
export const DENSITY_CODE_LAYERS = ["weath", "litho", "alt"];
export function layerCodeLookup(rows, collars, survey, desurveyMethod, cellMax) {
  if (!rows?.length) return null;
  const reachM = Math.max(50, 3 * (cellMax || 0));
  const byHole = new Map((collars || []).map((c) => [c.hole_id, c])), surveyBy = new Map();
  for (const s of survey || []) { if (!surveyBy.has(s.hole_id)) surveyBy.set(s.hole_id, []); surveyBy.get(s.hole_id).push(s); }
  const traces = new Map(), pts = [], step = Math.max(2, (cellMax || 0) / 2 || 2);
  for (const r of rows) {
    const code = String(r.value ?? "").trim(), f = Number(r.from), t = Number(r.to);
    if (!code || !(t > f) || !byHole.has(r.hole_id)) continue;
    if (!traces.has(r.hole_id)) traces.set(r.hole_id, desurveyHole(byHole.get(r.hole_id), surveyBy.get(r.hole_id) || [], desurveyMethod));
    const tr0 = traces.get(r.hole_id);
    if (!tr0?.length) continue;
    for (const q of intervalCodePoints(tr0, f, t, code, step)) pts.push(q);
  }
  return pts.length ? { codeOf: nearestCodeLookup(pts, reachM), reachM } : null;
}
// the blocks with .density where their code has one typed (a positive number); the rest unchanged (the pane's densities apply).
// -> { cells, used: [{ code, n, rho }] (rho null: no code density) }
export function cellsWithCodeDensity(cells, codeOf, densities) {
  const used = new Map();
  const out = (cells || []).map((c) => {
    const code = codeOf ? codeOf(c) : null, d = code != null ? Number(densities?.[code]) : NaN;
    const k = d > 0 ? code : null;
    used.set(k, (used.get(k) || 0) + 1);
    return d > 0 ? { ...c, density: d } : c;
  });
  return { cells: out, used: [...used].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, n, rho: code == null ? null : Number(densities[code]) })) };
}
// the pit inputs' per-code densities as numbers ({ code: t/m3 > 0 }), or null when none is typed
export function typedCodeDensities(table) {
  const out = {};
  for (const [k, v] of Object.entries(table || {})) { const n = Number(v); if (v !== "" && v != null && n > 0) out[k] = n; }
  return Object.keys(out).length ? out : null;
}
// a model for a pit run: its blocks with their code's density when the inputs name a layer and densities (saved with the pit, so Nested pits
// and Pit design weigh the blocks as the shell did). -> { model, used } (used null: no per-code density)
export function modelWithCodeDensity(model, inputs, layers, collars, survey, desurveyMethod) {
  const table = typedCodeDensities(inputs?.densityByCode);
  if (!model || !inputs?.densityLayer || !table) return { model, used: null };
  const cellMax = (model.cells || []).reduce((m, c) => Math.max(m, c.dx || 0, c.dy || 0, c.dz || 0), 0);
  const look = layerCodeLookup(layers?.[inputs.densityLayer], collars, survey, desurveyMethod, cellMax);
  if (!look) return { model, used: null };
  const j = cellsWithCodeDensity(model.cells, look.codeOf, table);
  return { model: { ...model, cells: j.cells }, used: j.used, reachM: look.reachM };
}
