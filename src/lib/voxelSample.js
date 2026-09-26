// TASKS.csv #323 (part 2) — evaluate a block / voxel model back onto the drillholes.
// Walks each hole's desurveyed trace in small steps, looks up the model cell at each step, and merges
// consecutive steps in the same cell into one downhole interval {hole_id, from, to, value}. The result is a
// downhole layer: shown beside the logs in the strip log (a recovered susceptibility next to the logged
// one, a grade estimate next to the assays) and exportable like any other interval table. Steps outside
// every cell leave a gap — nothing is extrapolated.
import { desurveyHole, pointOnTrace } from "./desurvey.js";

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

// Uniform bucket grid over the cells; a cell is registered in every bucket its box overlaps.
export function buildVoxelLookup(cells) {
  const valid = cells.filter((c) => [c.x, c.y, c.z, c.dx, c.dy, c.dz].every(Number.isFinite) && c.dx > 0 && c.dy > 0 && c.dz > 0);
  if (!valid.length) return { find: () => null, minCell: NaN };
  const b = median(valid.map((c) => Math.max(c.dx, c.dy, c.dz)));
  const minCell = Math.min(median(valid.map((c) => c.dx)), median(valid.map((c) => c.dy)), median(valid.map((c) => c.dz)));
  const buckets = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  for (const c of valid) {
    const i0 = Math.floor((c.x - c.dx / 2) / b), i1 = Math.floor((c.x + c.dx / 2 - 1e-9) / b);
    const j0 = Math.floor((c.y - c.dy / 2) / b), j1 = Math.floor((c.y + c.dy / 2 - 1e-9) / b);
    const k0 = Math.floor((c.z - c.dz / 2) / b), k1 = Math.floor((c.z + c.dz / 2 - 1e-9) / b);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const kk = key(i, j, k);
      if (!buckets.has(kk)) buckets.set(kk, []);
      buckets.get(kk).push(c);
    }
  }
  // half-open cell boxes: a point on a shared face belongs to exactly one cell
  const find = (x, y, z) => {
    const list = buckets.get(key(Math.floor(x / b), Math.floor(y / b), Math.floor(z / b)));
    if (!list) return null;
    for (const c of list) {
      if (x >= c.x - c.dx / 2 && x < c.x + c.dx / 2 && y >= c.y - c.dy / 2 && y < c.y + c.dy / 2 && z >= c.z - c.dz / 2 && z < c.z + c.dz / 2) return c;
    }
    return null;
  };
  return { find, minCell };
}

// model: { cells: [{x,y,z,dx,dy,dz,value}] } in project coordinates. Returns { rows, holes, step }.
export function sampleModelOnHoles({ model, collars, survey, desurveyMethod, step }) {
  const { find, minCell } = buildVoxelLookup(model.cells || []);
  const st = step > 0 ? step : Math.max(0.5, minCell / 4);
  const surveyBy = new Map();
  (survey || []).forEach((s) => { if (!surveyBy.has(s.hole_id)) surveyBy.set(s.hole_id, []); surveyBy.get(s.hole_id).push(s); });
  const rows = [];
  let holes = 0;
  for (const c of collars || []) {
    if (![c.x, c.y, c.z].every(Number.isFinite)) continue;
    const t = desurveyHole(c, surveyBy.get(c.hole_id) || [], desurveyMethod);
    if (!t.length) continue;
    const top = t[0].md, bottom = t[t.length - 1].md;
    let cur = null; // open interval
    let hit = false;
    for (let md = top; md < bottom; md += st) {
      const mid = Math.min(bottom, md + st / 2);
      const p = pointOnTrace(t, mid);
      const cell = find(p.x, p.y, p.z);
      const end = Math.min(bottom, md + st);
      if (cell && cur && cur.cell === cell) { cur.to = end; continue; }
      if (cur) { rows.push({ hole_id: c.hole_id, from: +cur.from.toFixed(2), to: +cur.to.toFixed(2), value: cur.cell.value }); cur = null; }
      if (cell && Number.isFinite(cell.value)) { cur = { cell, from: md, to: end }; hit = true; }
    }
    if (cur) rows.push({ hole_id: c.hole_id, from: +cur.from.toFixed(2), to: +cur.to.toFixed(2), value: cur.cell.value });
    if (hit) holes++;
  }
  return { rows, holes, step: st };
}
