// TASKS.csv #2593 (review #2486, WA lithium) — the pit counts the rock outside its block model as barren and called it 'undrilled'; on the
// lithium project 853 m of assays at or above 1 % Li2O in 57 holes lay inside the pit and outside the 25 ha model it was given. After the
// solve, the project's assays of the pit's element are placed on their holes: a sample inside the mined volume (its mid-point above the
// pit's floor in its column, below the ground) and more than one block from any model block is DRILLED rock outside the model. Pure.
import { pitCeiling, ceilingLookup } from "./pitCeiling.js";
import { pointOnTrace } from "./desurvey.js";

// cells: the model's blocks; samples: [{ hole_id, from, to, value }] (the pit's element in the model's unit, null when not assayed);
// traces: Map hole_id -> trace; pit: { positions, indices, cellM }; cutoff: the pit's cut-off grade (model unit)
// -> null (nothing to test) or { samples, metres, holes, oreSamples, oreMetres, oreHoles, holeIds: [the ore holes, most metres first] }
export function drilledOutsideModel(cells, samples, traces, pit, cutoff) {
  if (!cells?.length || !samples?.length || !pit?.positions?.length || !pit?.indices?.length) return null;
  const fin = Number.isFinite;
  // the model's blocks on their own lattice: a sample within one block of one is inside the model
  const med = (k) => cells.map((c) => c[k]).filter((v) => v > 0).sort((a, b) => a - b)[cells.length >> 1];
  const dx = med("dx"), dy = med("dy"), dz = med("dz");
  if (!(dx > 0 && dy > 0 && dz > 0)) return null;
  const c0 = cells[0], key = (i, j, k) => `${i},${j},${k}`, has = new Set();
  const idx = (x, o, d) => Math.round((x - o) / d);
  for (const c of cells) if (fin(c.x) && fin(c.y) && fin(c.z)) has.add(key(idx(c.x, c0.x, dx), idx(c.y, c0.y, dy), idx(c.z, c0.z, dz)));
  const nearModel = (p) => { const i = idx(p.x, c0.x, dx), j = idx(p.y, c0.y, dy), k = idx(p.z, c0.z, dz); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) if (has.has(key(i + a, j + b, k + e))) return true; return false; };
  // the pit's surface as a height field over the samples, at the pit's own cell size
  const pts = [];
  for (const s of samples) {
    const t = traces.get(s.hole_id), from = Number(s.from), to = Number(s.to);
    if (!t || !fin(from) || !fin(to) || to <= from) continue;
    const mid = (from + to) / 2, last = t[t.length - 1]?.md;
    if (fin(last) && (mid > last + 0.01 || mid < (t[0]?.md || 0) - 0.01)) continue; // off its trace: no position (#571's rule)
    const p = pointOnTrace(t, mid);
    if (fin(p?.x) && fin(p?.y) && fin(p?.z)) pts.push({ s, p, m: to - from });
  }
  if (!pts.length) return null;
  const cell = pit.cellM > 0 ? pit.cellM : dx;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { p } of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const frame = { x0, y0, dx: cell, dy: cell, nx: Math.max(1, Math.ceil((x1 - x0) / cell) + 1), ny: Math.max(1, Math.ceil((y1 - y0) / cell) + 1) };
  if (frame.nx * frame.ny > 4_000_000) return null;
  const floorAt = ceilingLookup(pitCeiling(pit.positions, pit.indices, frame), frame);
  const out = { samples: 0, metres: 0, holes: new Set(), oreSamples: 0, oreMetres: 0, oreHoles: new Map() };
  for (const { s, p, m } of pts) {
    const f = floorAt(p.x, p.y);
    if (!fin(f) || p.z < f - 1e-6) continue; // under the pit (or where the pit's mesh does not reach)
    if (nearModel(p)) continue;
    out.samples++; out.metres += m; out.holes.add(s.hole_id);
    if (fin(s.value) && fin(cutoff) && s.value >= cutoff) { out.oreSamples++; out.oreMetres += m; out.oreHoles.set(s.hole_id, (out.oreHoles.get(s.hole_id) || 0) + m); }
  }
  return { samples: out.samples, metres: out.metres, holes: out.holes.size, oreSamples: out.oreSamples, oreMetres: out.oreMetres, oreHoles: out.oreHoles.size, holeIds: [...out.oreHoles].sort((a, b) => b[1] - a[1]).map(([h]) => h) };
}
