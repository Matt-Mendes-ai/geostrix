// Where a surface sample (rock chip, soil, stream) or an outcrop measurement without its own elevation is drawn.
// Moved out of ViewerModule.jsx (TASKS.csv #2485) so the 3D View and the Surface Geology tab share one placement and
// one set of notices. Pure: no React, no three.js.
//
// TASKS.csv #606 — a surface sample with no elevation (z null: blank, or an all-zero Z column at import) sits on the
// terrain where the DEM covers it. TASKS.csv #1818 — with NO terrain it is drawn flat at a plan elevation (the median
// collar z, else the samples' own). TASKS.csv #1806 — outside the terrain's footprint it is drawn flat as with no
// terrain; over a DEM's fill (a void with no data) it stays unplaced (#927). TASKS.csv #2406 — a terrain triangulated
// from points (the collars) has no data over its voids, not a DEM hole: those samples are drawn flat too, and since
// #2571 they are marked as lying over a gap of that terrain (zTinGap), not outside it.

import { median } from "../arrayStats.js";

// TASKS.csv #1114 — the one median (the mean of the two middle values for an even count); null when there is no z
const zMedian = (rows) => { const m = median(rows.map((r) => r.z)); return Number.isFinite(m) ? m : null; };

// The plan elevation a sample without a z is drawn flat at. #2264: collars drilled from underground put the median
// 200 m down; the highest collar is then the nearest the surface. `underground` is the caller's verdict on the collars.
export function surfaceFlatElevation(collars, samples, underground) {
  const top = collars.length > 1 && underground ? Math.max(...collars.map((c) => c.z).filter(Number.isFinite)) : null;
  return (Number.isFinite(top) ? top : null) ?? zMedian(collars) ?? zMedian(samples) ?? 0;
}

const isTin = (terrain) => terrain?.source?.kind === "tin from points";

// The samples as drawn: own z kept, draped (zDraped), flat (zFlat, with zOutside off the terrain's box or zTinGap over a
// void of a TIN), or left out (over a DEM's fill). `groundAt(terrain, x, y)` is NaN where the terrain has no data.
// `srcOf` (a WeakMap) records each placed copy's source row. Returns the SAME array when every sample has its own z.
export function placeSurfaceSamples(samples, terrain, flatZ, groundAt, srcOf) {
  if (samples.every((r) => Number.isFinite(r.z))) return samples;
  const b = terrain?.bbox;
  const tin = isTin(terrain);
  return samples.map((r) => {
    if (Number.isFinite(r.z)) return r;
    const z = b ? groundAt(terrain, r.x, r.y) : NaN;
    const inside = !!b && r.x >= b[0] && r.x <= b[2] && r.y >= b[1] && r.y <= b[3];
    let out = null;
    if (Number.isFinite(z)) out = { ...r, z, zDraped: true };
    else if (!b) out = { ...r, z: flatZ, zFlat: true };
    else if (!inside) out = { ...r, z: flatZ, zFlat: true, zOutside: true };
    else if (tin) out = { ...r, z: flatZ, zFlat: true, zTinGap: true };
    if (out && srcOf) srcOf.set(out, r);
    return out;
  }).filter(Boolean);
}

// TASKS.csv #1618 — two placed lists put the same samples at the same heights (a draped copy is new each time), so a
// terrain edit that moves no sample (its colour, its opacity) hands back the same array and the scene is not rebuilt.
export function samePlacement(a, b) {
  return a.length === b.length && a.every((r, i) => {
    const s = b[i];
    if (r === s) return true;
    return (r.zDraped || r.zFlat) && (s.zDraped || s.zFlat) && r.zFlat === s.zFlat && !r.zOutside === !s.zOutside && !r.zTinGap === !s.zTinGap
      && r.z === s.z && r.x === s.x && r.y === s.y && r.sample_id === s.sample_id;
  });
}

// What the notices say: drawn flat with no terrain, flat outside the terrain, flat over a TIN's gap, not drawn.
export function surfacePlacementCounts(samples, placed) {
  let noTerrain = 0, outside = 0, tinGap = 0;
  for (const r of placed) {
    if (!r.zFlat) continue;
    if (r.zOutside) outside++;
    else if (r.zTinGap) tinGap++;
    else noTerrain++;
  }
  return { noTerrain, outside, tinGap, unplaced: samples.length - placed.length };
}

// TASKS.csv #2485 (2) — outcrop measurements without an elevation: how many find the terrain's ground and how many lie
// outside it or over its gaps (syncSurfaceStructures then reads the terrain's edge or filled level there, not ground).
export function structureGroundCounts(rows, terrain, groundAt) {
  let ground = 0, off = 0;
  if (!terrain?.bbox) return { ground, off };
  for (const r of rows) {
    if (r.z != null) continue;
    if (Number.isFinite(groundAt(terrain, r.x, r.y))) ground++; else off++;
  }
  return { ground, off };
}
