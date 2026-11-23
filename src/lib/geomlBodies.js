// TASKS.csv #4017 (Matt, 2026-11-22: "the DACT contact enclosing what is not dacite, it should be the opposite") — geoML's rock-unit run as CLOSED BODIES.
//
// What was wrong (probed on made-up bodies against the real add-on, 0.1.5): the add-on's "contact surface" is a bare 50 % isosurface of its model
// (geoml BlockSet.get_contour at 0), never closed against the model box. A closed isosurface wraps whichever rock is the minority pocket, so for a unit that
// IS the matrix (most holes cut it) the white shell enclosed the OTHER rock (0 of 771 logged intercepts of the unit inside it, all 39 of the pocket's),
// and for a layered unit the surface is open (no inside at all). The probability blocks were right in every case.
//
// What this does instead: the closed body is built HERE from the run's own probability blocks, the way the grade shell is built from a grade grid
// (lib/marchingCubes.js with the grid closed round the edge, lib/groundCap.js to cut it at the ground), so it is the region where the unit's probability is
// at or above the level (50 % unless the person sets another), whichever side that is: it wraps the unit by construction, and the volume means something.
// Blocks the model cannot speak for (beyond its range of the samples) are no-data, which the shell closes against: counted and said, as the grade shell does.
// Pure: no React, no DOM.
import { marchingCubes } from "./marchingCubes.js";
import { capFieldAtGround } from "./groundCap.js";
import { meshVolume } from "./unitVolumes.js";
import { meshBodies } from "./meshBodies.js";
import { buildMeshQuery, isPointInsideMesh, isMeshClosed } from "./meshQuery.js";

export const BODY_LEVEL = 0.5;
export const BODY_MIN_CELLS = 2; // a body smaller than this many blocks is a speck of the field crossing the level, not a body

// the run's blocks ({ cell, x, y, z, <field>: [] }, one per block, centres on a regular grid) -> a dense grid, x fastest, NaN where no block was returned
export function blocksGrid(b, field = "probability", dropped = null) {
  const cell = b.cell, v = b[field], n = b.x.length;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { if (b.x[i] < x0) x0 = b.x[i]; if (b.x[i] > x1) x1 = b.x[i]; if (b.y[i] < y0) y0 = b.y[i]; if (b.y[i] > y1) y1 = b.y[i]; if (b.z[i] < z0) z0 = b.z[i]; if (b.z[i] > z1) z1 = b.z[i]; }
  const nx = Math.round((x1 - x0) / cell) + 1, ny = Math.round((y1 - y0) / cell) + 1, nz = Math.round((z1 - z0) / cell) + 1;
  const values = new Float32Array(nx * ny * nz).fill(NaN);
  for (let i = 0; i < n; i++) {
    const ix = Math.round((b.x[i] - x0) / cell), iy = Math.round((b.y[i] - y0) / cell), iz = Math.round((b.z[i] - z0) / cell);
    if (dropped && dropped[i]) continue; // no-data: the shell closes against it
    values[ix + nx * (iy + ny * iz)] = v[i];
  }
  return { values, nx, ny, nz, origin: { x: x0, y: y0, z: z0 }, spacing: { x: cell, y: cell, z: cell } };
}

// -> { positions (Float64, E N Z), indices (Uint32), volumeM3, closed, bodies, voids (pockets inside a body), droppedSpecks, closingShare (0-1 of the vertices on a no-data wall), level, cell }
// b: the run's blocks; level: the probability the body is drawn at; dropped: per block, true when the model cannot speak for it (beyond its range of the samples);
// groundAt(x, y) -> elevation or NaN: the body is cut there (terrain, else a surface through the collars); null: not cut.
export function enclosedBodies(b, { level = BODY_LEVEL, dropped = null, groundAt = null, field = "probability" } = {}) {
  const g = blocksGrid(b, field, dropped);
  let values = g.values;
  if (groundAt) values = capFieldAtGround(values, g.nx, g.ny, g.nz, g.origin, g.spacing, level, groundAt).values;
  const mc = marchingCubes(values, g.nx, g.ny, g.nz, level, { origin: g.origin, spacing: g.spacing, noData: "outside" });
  let faces = mc.faces, droppedSpecks = 0;
  // specks: bodies of fewer than BODY_MIN_CELLS blocks of volume go
  if (faces.length) {
    const lab = meshBodies(faces).labels, vol = new Map();
    const P = mc.vertices;
    faces.forEach((f, i) => { const a = P[f[0]], c = P[f[1]], d = P[f[2]]; const v6 = a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0]); vol.set(lab[i], (vol.get(lab[i]) || 0) + v6 / 6); });
    const min = BODY_MIN_CELLS * g.spacing.x * g.spacing.y * g.spacing.z, keepLabel = new Set([...vol].filter(([, v]) => Math.abs(v) >= min).map(([l]) => l));
    if (keepLabel.size < vol.size) { const kept = faces.filter((f, i) => keepLabel.has(lab[i])); droppedSpecks = vol.size - keepLabel.size; faces = kept; }
  }
  // the vertices that are used, in order
  const map = new Map(), pos = [], idx = [];
  const take = (v) => { let i = map.get(v); if (i === undefined) { i = map.size; map.set(v, i); const p = mc.vertices[v]; pos.push(p[0], p[1], p[2]); } return i; };
  for (const f of faces) idx.push(take(f[0]), take(f[1]), take(f[2]));
  const positions = Float64Array.from(pos), indices = Uint32Array.from(idx);
  // a connected surface that encloses a void (a pocket of other rock inside the unit) is wound inward: it is a hole in a body, not a body of its own
  let bodies = 0, voids = 0;
  if (faces.length) {
    const lab = meshBodies(faces).labels, vol = new Map(), P = mc.vertices;
    faces.forEach((f, i) => { const a = P[f[0]], c = P[f[1]], d = P[f[2]]; vol.set(lab[i], (vol.get(lab[i]) || 0) + (a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0])) / 6); });
    for (const v of vol.values()) if (v >= 0) bodies++; else voids++;
  }
  return {
    positions, indices, volumeM3: positions.length ? meshVolume(positions, indices) : 0, closed: positions.length ? isMeshClosed(positions, indices).closed : false, bodies, voids, droppedSpecks,
    closingShare: mc.vertices.length ? mc.closingVertices / mc.vertices.length : 0, level, cell: b.cell,
  };
}

// the closing side checked against the unit's own logged intercepts: the check points ([[x, y, z]], along them, from geomlIntercepts.interceptCheckPoints) that
// fall inside the closed body, and the intercepts (spans: { start, count }) with a point inside. -> { points, inside, spans, reached } or null when there is no closed body
export function interceptsInsideBodies(positions, indices, points, spans, { maxPoints = 3000 } = {}) {
  if (!positions?.length || !indices?.length || !points?.length || !spans?.length || !isMeshClosed(positions, indices).closed) return null;
  const q = buildMeshQuery(positions, indices);
  const step = Math.max(1, Math.ceil(points.length / maxPoints)), ins = new Uint8Array(points.length);
  let n = 0, inside = 0;
  for (let i = 0; i < points.length; i += step) { ins[i] = isPointInsideMesh(q, { x: points[i][0], y: points[i][1], z: points[i][2] }) ? 1 : 0; n++; inside += ins[i]; }
  let reached = 0;
  for (const s of spans) { let any = false; for (let i = s.start; i < s.start + s.count && !any; i++) if (ins[i]) any = true; if (any) reached++; }
  return { points: n, inside, spans: spans.length, reached, pointShare: n ? inside / n : 0 };
}

// 'bodies' | 'layers' for a unit, from how its logged intercepts sit and from nothing else (never the deposit type): a LAYER is a unit that most holes cut once, as
// one band at much the same level, not at the collar (a horizon: an open contact between units is the picture of it); anything else - a few holes, several runs
// in a hole, a very different level from hole to hole, or a unit at the collar that most holes cut (the matrix) - is a BODY, closed against the box and the ground.
// spans: [{ hole_id, from, to, start, count }] and points: [[x, y, z]] as from geomlIntercepts.interceptCheckPoints; holes: how many holes the model has.
// -> { shape, why: [text], holesCut, holes, share, spreadM, thicknessM }; the text is English (shown through tr by the panel as one of a few messages)
export function suggestShape(spans, points, holes) {
  const by = new Map();
  for (const s of spans || []) { const a = by.get(s.hole_id) || by.set(s.hole_id, []).get(s.hole_id); a.push(s); }
  const holesCut = by.size, total = Math.max(holes || 0, holesCut);
  const out = { shape: "bodies", reason: "few", holesCut, holes: total, share: total ? holesCut / total : 0, spreadM: null, thicknessM: null, singleBandShare: null };
  if (holesCut < 4) return out; // too few holes to call a horizon
  const mids = [], thick = [], atCollar = []; let single = 0;
  for (const list of by.values()) {
    if (list.length === 1) single++;
    const first = list[0], last = list[list.length - 1];
    const zTop = points[first.start]?.[2], zBase = points[last.start + last.count - 1]?.[2];
    if (!Number.isFinite(zTop) || !Number.isFinite(zBase)) continue;
    mids.push((zTop + zBase) / 2); thick.push(Math.abs(zTop - zBase) || 1);
    atCollar.push(first.from <= 2);
  }
  if (mids.length < 4) return out;
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const spread = q(mids, 0.75) - q(mids, 0.25), thickness = q(thick, 0.5);
  out.spreadM = Math.round(spread); out.thicknessM = Math.round(thickness); out.singleBandShare = single / holesCut;
  const collarShare = atCollar.filter(Boolean).length / atCollar.length;
  if (out.share < 0.5) { out.reason = "partial"; return out; }
  if (out.singleBandShare < 0.8) { out.reason = "several"; return out; }
  if (collarShare >= 0.5) { out.reason = "collar"; return out; }
  if (spread > Math.max(2 * thickness, 20)) { out.reason = "uneven"; return out; }
  out.shape = "layers"; out.reason = "horizon";
  return out;
}

// ---- the blocks a run asks for -------------------------------------------------------------------------------------------------------------------------
// A body is as fine as the blocks it is cut from, so an 'Enclosed bodies' run asks the add-on for blocks half the size of the quality's (never under 10 m);
// the add-on keeps them within its own budget of cells by growing the block (models.py _grid: x1.25 until the box holds at most BLOCK_CAP of them), which is
// repeated here to say, before the run, what it will be. box: the model box in metres [dx, dy, dz].
export const BLOCK_CAP = 100000; // the add-on's MAX_BLOCKS_OUT, the 3D view's cell budget
export const BODY_MIN_BLOCK_M = 10;
export const bodiesBlockSize = (qualityBlockM) => Math.max(BODY_MIN_BLOCK_M, Math.round((Number(qualityBlockM) || 40) / 2));
export function blockPlan(box, cellM, cap = BLOCK_CAP) {
  let cell = cellM;
  for (let i = 0; i < 200; i++) {
    const n = box.map((d) => Math.max(1, Math.ceil(d / cell)));
    const count = n[0] * n[1] * n[2];
    if (count <= cap) return { cell: +cell.toFixed(2), n, blocks: count, grown: cell > cellM };
    cell *= 1.25;
  }
  return { cell, n: [1, 1, 1], blocks: 1, grown: true };
}
// the model box of a unit run, as the add-on makes it: the training points' extent plus the pads (100 m across, 50 m down by default); the holes' extent stands in for the points
export function modelBox(collars, { padM = 100, padZM = 50 } = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of collars || []) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) continue;
    const len = Number.isFinite(c.length) ? c.length : 0;
    x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); z0 = Math.min(z0, c.z - len); z1 = Math.max(z1, c.z);
  }
  return x0 === Infinity ? null : [x1 - x0 + 2 * padM, y1 - y0 + 2 * padM, z1 - z0 + 2 * padZM];
}

// Measured on the add-on (0.1.5) with a made-up body: 78,732 blocks of 18.75 m predicted in 44 s (probability and uncertainty), 8,125 in about 5 s: about 0.56 ms a block
// on a recent laptop. So the finer blocks of a body cost this much more after training, and nothing in training (the contact surface stage does not depend on them).
export const PREDICT_S_PER_BLOCK = 0.00056;
export const bodiesExtraSeconds = (bodiesBlocks, layersBlocks) => Math.max(0, bodiesBlocks - layersBlocks) * PREDICT_S_PER_BLOCK;
// TASKS.csv #4029 - what a grade run's finer blocks cost after training, measured on the add-on 0.1.5 with a made-up copper (stage times of the job): 3,240 blocks of 50 m predicted in about 3 s, 25,920 of 25 m in about 7 s, so about 0.2 ms a block (a unit's 0.56 ms is for probability and uncertainty both)
export const GRADE_S_PER_BLOCK = 0.0002;
export const gradeExtraSeconds = (shellBlocks, plainBlocks) => Math.max(0, shellBlocks - plainBlocks) * GRADE_S_PER_BLOCK;

// ---- grade shells ---------------------------------------------------------------------------------------------------------------------------------------
// TASKS.csv #4017 (b) — a geoML grade run's predicted-grade blocks as closed shells at one or more cut-offs, the way the Grade shell makes them: the same builder as the
// unit's bodies, on the predicted grade (or, for the uncertainty, on the P10 / P90 of its simulations) instead of the probability.

// the cut-offs the samples themselves suggest, when none is typed: their median, Q3 and 90th percentile (the positive values, two significant figures, never a number that
// reads as a deposit's: lib/cutoffTable.js defaultCutoffs); `first` is the one a run starts with, the 90th percentile as the Grade shell pane proposes (#3272)
export function gradeCutoffSuggestion(values) {
  const v = (values || []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return { median: null, q3: null, p90: null, first: null, list: [] };
  const at = (p) => v[Math.floor(p * (v.length - 1))];
  const two = (x) => +x.toPrecision(2);
  const median = two(at(0.5)), q3 = two(at(0.75)), p90 = two(at(0.9));
  return { median, q3, p90, first: p90, list: [...new Set([median, q3, p90])].sort((a, b) => a - b) };
}

// "0.5, 1; 2" -> [0.5, 1, 2] (positive numbers only, once each, ascending)
export const parseShellCutoffs = (text) => [...new Set(String(text || "").split(/[\s,;]+/).map((t) => (t === "" ? NaN : Number(t))).filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);

// b: the run's blocks ({ cell, x, y, z, prediction, p10?, p90? }); cutoffs: [number]; bands: also the P10 and P90 shells (when the blocks carry them); dropped / groundAt: as enclosedBodies;
// samples: [{ x, y, z, value }] to check each shell against (the samples at or above its cut-off that fall inside it)
// -> [{ kind: "mean" | "p10" | "p90", cutoff, body (enclosedBodies' result, empty when no block reaches it), above, inside }] in cut-off order, the mean shell first
export function gradeShells(b, { cutoffs, bands = false, dropped = null, groundAt = null, samples = null } = {}) {
  const kinds = [["mean", "prediction"], ...(bands && b.p10 ? [["p10", "p10"]] : []), ...(bands && b.p90 ? [["p90", "p90"]] : [])];
  const out = [];
  for (const cutoff of cutoffs || []) {
    const above = (samples || []).filter((s) => Number.isFinite(s.value) && s.value >= cutoff);
    for (const [kind, field] of kinds) {
      const body = enclosedBodies(b, { level: cutoff, dropped, groundAt, field });
      let inside = null;
      if (above.length && body.positions.length && body.closed) {
        const chk = interceptsInsideBodies(body.positions, body.indices, above.map((s) => [s.x, s.y, s.z]), above.map((s, i) => ({ start: i, count: 1 })));
        inside = chk ? { inside: chk.inside, of: chk.points, share: chk.pointShare } : null;
      }
      out.push({ kind, cutoff, body, above: above.length, inside });
    }
  }
  return out;
}
