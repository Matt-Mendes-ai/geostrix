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
