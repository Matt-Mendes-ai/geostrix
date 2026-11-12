// TASKS.csv #2663 (follow-up of #2642) — a sheet / dyke body from the map checked against the unit's logged intervals: how many of the
// logged intercepts fall inside the body (each tested at its middle, down its desurveyed hole), and their true thickness across the sheet
// (each inside intercept's vector projected on the sheet's pole). holes: the holes of the placed intercepts. The review's case: 522 holes logged the unit and the body used none of them.
// Pure: no three.js.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { buildMeshQuery, isPointInsideMesh } from "./meshQuery.js";
import { poleFromDipDD } from "./coreOrientation.js";

// positions / indices: the body in world E, N, Z; sheet: { dip, dipDir }; unit: the map unit; litho: logged rows { hole_id, from, to, value };
// codeUnit: { code -> map unit } (Model from map's code matching) -> null (no logged interval of the unit) or
// { intercepts, holes, placed, inside, outside, thickness: { min, median, max } | null }
export function sheetLogCheck({ positions, indices, sheet, unit, litho, codeUnit, collars, survey, desurveyMethod }) {
  const rows = (litho || []).filter((r) => codeUnit?.[String(r.value ?? "").trim()] === unit && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to)) && Number(r.to) > Number(r.from));
  if (!rows.length) return null;
  const q = buildMeshQuery(positions, indices);
  const byCollar = new Map((collars || []).map((c) => [c.hole_id, c])), bySurvey = new Map();
  for (const s of survey || []) (bySurvey.get(s.hole_id) || bySurvey.set(s.hole_id, []).get(s.hole_id)).push(s);
  const traces = new Map();
  const traceOf = (h) => { if (!traces.has(h)) { const c = byCollar.get(h); let t = []; try { t = c ? desurveyHole(c, bySurvey.get(h) || [], desurveyMethod) || [] : []; } catch { t = []; } traces.set(h, t); } return traces.get(h); };
  const pole = sheet && Number.isFinite(sheet.dip) && Number.isFinite(sheet.dipDir) ? poleFromDipDD(sheet.dipDir, sheet.dip) : null; // [E, N, Up]
  let placed = 0, inside = 0;
  const thick = [], placedHoles = new Set();
  for (const r of rows) {
    const tr = traceOf(r.hole_id);
    const a = tr.length ? pointOnTrace(tr, Number(r.from)) : null, b = tr.length ? pointOnTrace(tr, Number(r.to)) : null;
    if (!a || !b) continue;
    placed++; placedHoles.add(r.hole_id);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    if (!q || !isPointInsideMesh(q, mid)) continue;
    inside++;
    if (pole) thick.push(Math.abs((b.x - a.x) * pole[0] + (b.y - a.y) * pole[1] + (b.z - a.z) * pole[2]));
  }
  thick.sort((p, s) => p - s);
  return {
    intercepts: rows.length, holes: placedHoles.size, placed, inside, outside: placed - inside,
    thickness: thick.length ? { min: thick[0], median: thick[thick.length >> 1], max: thick[thick.length - 1] } : null,
  };
}

// TASKS.csv #2724 (follow-up of #2663) — the sheet FITTED to the logs, offered to the user (Model from map fills the dip and dip direction
// boxes when they click it; never a default). The strike is the map outline's long axis (the outcrop trace: its vertices' principal
// direction, through their centre); each logged intercept of the unit, desurveyed, is measured at its middle: d = its horizontal offset
// from the trace across strike, h = its depth below the ground at the trace point beside it. A plane through the trace dipping at
// `dip` puts an intercept h below the ground at d = h / tan(dip) down dip, so cot(dip) = sum(h d) / sum(h^2) (least squares through the
// trace) and its sign gives the dip direction (across-strike +90 or -90). True thickness: each intercept's vector on the fitted pole.
// polygons: the unit's map polygons as rings [[x, y], ...]; groundAt(x, y) -> z (null off the terrain).
// -> null (no logged interval of the unit) or { intercepts, placed, used, holes, strike, dip, dipDir, rmsM, thickness, reason? }
//    reason: "no-trace" (no outline), "too-few" (no intercept below the ground beside the trace), "flat" (dip under 10: a sill, not a sheet)
export function fitSheetToLogs({ polygons, groundAt, unit, litho, codeUnit, collars, survey, desurveyMethod }) {
  const rows = (litho || []).filter((r) => codeUnit?.[String(r.value ?? "").trim()] === unit && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to)) && Number(r.to) > Number(r.from));
  if (!rows.length) return null;
  // each ring's vertices, its closing repeat of the first left out (it would weigh that corner twice)
  const pts = (polygons || []).flatMap((rings) => (rings || []).flatMap((r) => { const v = (r || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])); return v.length > 1 && v[0][0] === v[v.length - 1][0] && v[0][1] === v[v.length - 1][1] ? v.slice(0, -1) : v; }));
  const base = { intercepts: rows.length, placed: 0, used: 0, holes: 0 };
  if (pts.length < 3) return { ...base, reason: "no-trace" };
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  let sxx = 0, syy = 0, sxy = 0; for (const p of pts) { const dx = p[0] - cx, dy = p[1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy); // the long axis, from +x counter-clockwise
  const ux = Math.cos(t), uy = Math.sin(t), vx = -uy, vy = ux; // along strike; across strike (+v)
  const byCollar = new Map((collars || []).map((c) => [c.hole_id, c])), bySurvey = new Map();
  for (const s of survey || []) (bySurvey.get(s.hole_id) || bySurvey.set(s.hole_id, []).get(s.hole_id)).push(s);
  const traces = new Map();
  const traceOf = (h) => { if (!traces.has(h)) { const c = byCollar.get(h); let tr = []; try { tr = c ? desurveyHole(c, bySurvey.get(h) || [], desurveyMethod) || [] : []; } catch { tr = []; } traces.set(h, tr); } return traces.get(h); };
  const seg = [], holes = new Set();
  let placed = 0;
  for (const r of rows) {
    const tr = traceOf(r.hole_id);
    const a = tr.length ? pointOnTrace(tr, Number(r.from)) : null, b = tr.length ? pointOnTrace(tr, Number(r.to)) : null;
    if (!a || !b) continue;
    placed++;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    const s = (mx - cx) * ux + (my - cy) * uy, d = (mx - cx) * vx + (my - cy) * vy;
    const g = groundAt ? groundAt(cx + s * ux, cy + s * uy) : null;
    if (!Number.isFinite(g) || !(g - mz > 0)) continue;
    seg.push({ d, h: g - mz, a, b }); holes.add(r.hole_id);
  }
  const res = { ...base, placed, used: seg.length, holes: holes.size, strike: ((90 - (t * 180) / Math.PI) % 180 + 180) % 180 };
  if (!seg.length) return { ...res, reason: "too-few" };
  const shd = seg.reduce((q, p) => q + p.h * p.d, 0), shh = seg.reduce((q, p) => q + p.h * p.h, 0);
  const cot = shd / shh;
  const dip = (Math.atan2(1, Math.abs(cot)) * 180) / Math.PI;
  const across = ((90 - (Math.atan2(vy, vx) * 180) / Math.PI) % 360 + 360) % 360; // the azimuth of +v
  const dipDir = cot >= 0 ? across : (across + 180) % 360;
  const sinD = Math.sin((dip * Math.PI) / 180);
  const rmsM = Math.sqrt(seg.reduce((q, p) => q + (p.d - p.h * cot) ** 2, 0) / seg.length) * sinD; // perpendicular to the plane
  const pole = poleFromDipDD(dipDir, dip);
  const th = seg.map((p) => Math.abs((p.b.x - p.a.x) * pole[0] + (p.b.y - p.a.y) * pole[1] + (p.b.z - p.a.z) * pole[2])).sort((p, q) => p - q);
  const out = { ...res, dip: Math.round(dip), dipDir: Math.round(dipDir) % 360, rmsM, thickness: { min: th[0], median: th[th.length >> 1], max: th[th.length - 1] } };
  return dip < 10 ? { ...out, reason: "flat" } : out;
}
