// TASKS.csv #3324 (review #3195, Galore Creek) — the first check of an IP survey on a porphyry, 'does chargeability follow the sulphide?',
// could not be made: nothing sampled the 3D IP cloud along the holes, so Downhole logs could plot pyrite against sulphur but not against
// the IP response. Here: walk each hole's desurveyed trace in steps and take, at each step's midpoint, the survey's value at the nearest
// point within a distance (or the inverse-distance mean of the points within it). Steps with no point that near leave a gap, nothing is
// extrapolated. The rows are a numeric downhole layer ('On holes: <survey>'), which Downhole logs, strip logs and sections read like the
// block-model evaluation's (#323, #1595).
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { median } from "./arrayStats.js";
import { acrossLineSpacing } from "./surveyGridDefaults.js"; // a cloud on sections: how far apart they are

const finite3 = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z) && Number.isFinite(p?.value);

// a 3D bucket grid of cell `size` -> near(x, y, z, r): the points within r (r <= size)
export function pointIndex3d(points, size) {
  const b = new Map(), key = (i, j, k) => `${i},${j},${k}`, s = size > 0 ? size : 1;
  for (const p of points) { const k = key(Math.floor(p.x / s), Math.floor(p.y / s), Math.floor(p.z / s)); (b.get(k) || b.set(k, []).get(k)).push(p); }
  return (x, y, z, r) => {
    const i0 = Math.floor(x / s), j0 = Math.floor(y / s), k0 = Math.floor(z / s), out = [], r2 = r * r;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      for (const p of b.get(key(i, j, k)) || []) { const d2 = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2; if (d2 <= r2) out.push([p, d2]); }
    }
    return out;
  };
}

const nice = (v) => { if (!(v > 0)) return null; const p = 10 ** Math.floor(Math.log10(v)); return +([1, 2, 2.5, 5, 10].map((k) => k * p).find((c) => c >= v - 1e-9 * p) || 10 * p).toPrecision(6); };

// The proposals from the cloud's own 3D spacing (the median distance from a sample of points to their nearest neighbour in 3D):
// the search distance 1.5 spacings, the step a quarter spacing (0.5 to 10 m). A cloud on sections (2D inversions along lines, stations
// at least 3 times closer along them than across): the search distance is three quarters of the spacing between sections, so a hole
// between two reaches the nearer one (live: 5 m stations on sections 200 m apart gave 10 m, and no hole was sampled).
// -> { spacing, maxDist, step, sectionSpacing } or null.
export function suggestHoleSampling(points, sample = 400) {
  const pts = (points || []).filter(finite3);
  if (pts.length < 10) return null;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z; }
  const vol = Math.max(1, xmax - xmin) * Math.max(1, ymax - ymin) * Math.max(1, zmax - zmin);
  let size = Math.cbrt(vol / pts.length) * 2; // twice the spacing of an even spread
  const n = pts.length, idx = n <= sample ? pts.map((_, i) => i) : Array.from({ length: sample }, (_, k) => Math.floor((k * n) / sample));
  let d = [];
  for (let tries = 0; tries < 6 && d.length < idx.length / 2; tries++, size *= 2) {
    const near = pointIndex3d(pts, size);
    d = [];
    for (const i of idx) { const a = pts[i]; let best = Infinity; for (const [p, d2] of near(a.x, a.y, a.z, size)) if (p !== a && d2 > 0 && d2 < best) best = d2; if (Number.isFinite(best)) d.push(Math.sqrt(best)); }
  }
  if (!d.length) return null;
  const spacing = median(d);
  const step = Math.min(10, Math.max(0.5, nice(spacing / 4)));
  const a = acrossLineSpacing(pts);
  if (a && a.across >= 3 * a.along && 0.75 * a.across > 1.5 * spacing) return { spacing, maxDist: +(0.75 * a.across).toPrecision(2), step, sectionSpacing: a.across };
  return { spacing, maxDist: nice(1.5 * spacing), step, sectionSpacing: null };
}

// -> { rows: [{ hole_id, from, to, value, dist, numeric, modelled }], holes, steps, hit }
// mode "nearest": the nearest point's value (consecutive steps on the same point are one interval); "idw": the inverse-distance mean
// (power 2) of the points within maxDist.
export function sampleSurveyOnHoles({ points, collars, survey, desurveyMethod, step = 5, maxDist = 25, mode = "nearest", power = 2 }) {
  const pts = (points || []).filter(finite3);
  const st = step > 0 ? step : 5, R = maxDist > 0 ? maxDist : 25;
  const near = pointIndex3d(pts, R);
  const surveyBy = new Map();
  (survey || []).forEach((s) => { if (!surveyBy.has(s.hole_id)) surveyBy.set(s.hole_id, []); surveyBy.get(s.hole_id).push(s); });
  const rows = [];
  let holes = 0, steps = 0, hit = 0;
  const r2 = (v) => +v.toFixed(2);
  for (const c of collars || []) {
    if (![c.x, c.y, c.z].every(Number.isFinite)) continue;
    const t = desurveyHole(c, surveyBy.get(c.hole_id) || [], desurveyMethod);
    if (!t.length) continue;
    const top = t[0].md, bottom = t[t.length - 1].md;
    let cur = null, any = false;
    const flush = () => { if (cur) rows.push({ hole_id: c.hole_id, from: r2(cur.from), to: r2(cur.to), value: cur.value, dist: +cur.dist.toFixed(1), numeric: true, modelled: true }); cur = null; };
    for (let md = top; md < bottom - 1e-9; md += st) {
      steps++;
      const end = Math.min(bottom, md + st), p = pointOnTrace(t, (md + end) / 2);
      const found = near(p.x, p.y, p.z, R);
      if (!found.length) { flush(); continue; }
      hit++; any = true;
      if (mode === "idw") {
        let sw = 0, sv = 0, dmin = Infinity, exact = null;
        for (const [q, d2] of found) { const dd = Math.sqrt(d2); if (dd < dmin) dmin = dd; if (dd < 1e-9) { exact = q.value; break; } const w = 1 / dd ** power; sw += w; sv += w * q.value; }
        flush();
        rows.push({ hole_id: c.hole_id, from: r2(md), to: r2(end), value: exact != null ? exact : sv / sw, dist: +(exact != null ? 0 : dmin).toFixed(1), numeric: true, modelled: true });
        continue;
      }
      let best = null, bd = Infinity;
      for (const [q, d2] of found) if (d2 < bd) { bd = d2; best = q; }
      if (cur && cur.pt === best) { cur.to = end; cur.dist = Math.min(cur.dist, Math.sqrt(bd)); continue; }
      flush();
      cur = { pt: best, from: md, to: end, value: best.value, dist: Math.sqrt(bd) };
    }
    flush();
    if (any) holes++;
  }
  return { rows, holes, steps, hit };
}
