// TASKS.csv #1719 (review #1645, Copley) — a geologist starting a surface map on a drilled prospect wants the collars' top-of-hole
// lithology as subcrop points: the first logged unit under the overburden / casing / no-recovery at the top of each hole, at the
// hole's own position at that depth (an angled hole's bedrock pierce point is not at its collar). A starting map, not a mapped
// outcrop: the points say what the drill met under cover, and where. Pure.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { roleForLithology, colorForLithology } from "./layers.js";

const SKIP = new Set(["overburden", "no recovery"]);

// TASKS.csv #2407 (review #2325, WA uranium) — the role a code was given in 3D Modelling > Modelling codes wins over the guess from its name:
// with QA (the Quaternary cover) set to overburden, the "subcrop map" was still 408 points of QA, as roleForLithology knows only names
// like OVB / OB / CAS / NR. modellingCodes: { codes: [{ name, role }] }
export function roleWithCodes(modellingCodes) {
  const set = new Map();
  // #2566 — by the code in any case: 'la' took no role from 'LA'
  for (const c of modellingCodes?.codes || []) if (c?.name != null && c.role) set.set(String(c.name).trim().toUpperCase(), c.role);
  return set.size ? (value) => set.get(String(value).trim().toUpperCase()) ?? roleForLithology(value) : roleForLithology;
}

// -> [{ hole_id, unit, from, to, cover (m of skipped intervals above), x, y, z }], one per hole with a logged unit under its cover
// TASKS.csv #2411 (WA uranium) / #2570 (WA lithium) — a hole whose log STARTS below its collar (an unlogged precollar, a bench hole logged
// only where it met pegmatite) is not under cover: nothing was logged above, nothing called overburden. Such a hole is left out (its first
// unit is a point down the hole, not a subcrop) and listed in report.lateStart [{ hole_id, logStart, unit }]. LATE_START_M: a log that
// starts within a metre of the collar counts as from the collar.
export const LATE_START_M = 1;
export function collarSubcrop({ collars, survey, litho, desurveyMethod, roleOf = roleForLithology, report = null }) {
  const byHoleSurvey = new Map(), byHoleLitho = new Map();
  for (const s of survey || []) (byHoleSurvey.get(s.hole_id) || byHoleSurvey.set(s.hole_id, []).get(s.hole_id)).push(s);
  for (const r of litho || []) {
    const f = Number(r.from), t = Number(r.to), v = String(r.value ?? "").trim();
    if (!Number.isFinite(f) || !v) continue;
    (byHoleLitho.get(r.hole_id) || byHoleLitho.set(r.hole_id, []).get(r.hole_id)).push({ from: f, to: Number.isFinite(t) ? t : f, value: v });
  }
  // TASKS.csv #2566 (review #2486) — one unit per code whatever its case ('la' 3 and 'LA' 513 were two units with two colours): the
  // spelling used most often names it
  const spell = new Map();
  for (const l of byHoleLitho.values()) for (const r of l) { const k = r.value.toUpperCase(), m = spell.get(k) || new Map(); m.set(r.value, (m.get(r.value) || 0) + 1); spell.set(k, m); }
  const canon = new Map([...spell].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]]));
  const out = [];
  for (const c of collars || []) {
    const rows = (byHoleLitho.get(c.hole_id) || []).sort((a, b) => a.from - b.from);
    const f0 = rows.find((r) => !SKIP.has(roleOf(r.value)));
    if (!f0) continue;
    if (rows[0].from > LATE_START_M) { report?.lateStart?.push({ hole_id: c.hole_id, logStart: rows[0].from, unit: f0.value }); continue; } // #2411 / #2570
    const first = { ...f0, value: canon.get(f0.value.toUpperCase()) || f0.value };
    let trace = [];
    try { trace = desurveyHole(c, byHoleSurvey.get(c.hole_id) || [], desurveyMethod) || []; } catch { trace = []; }
    const p = trace.length ? pointOnTrace(trace, first.from) : (Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)) ? { x: Number(c.x), y: Number(c.y), z: Number(c.z) } : null);
    if (!p) continue;
    out.push({ hole_id: c.hole_id, unit: first.value, from: first.from, to: first.to, cover: first.from, x: p.x, y: p.y, z: p.z });
  }
  return out;
}

// the points as a geology map layer (points, a unit field, coloured by unit like the logs), at their own elevation. colorOf: the
// 3D view's own colour for a lithology (its legend override, else colorForLithology), so a recoloured unit matches
export function subcropLayer(points, name = "Subcrop from collars", colorOf = colorForLithology) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const counts = new Map();
  const features = points.map((p) => {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    counts.set(p.unit, (counts.get(p.unit) || 0) + 1);
    return { parts: [[[p.x, p.y, p.z]]], attributes: { unit: p.unit, hole_id: p.hole_id, from_m: +p.from.toFixed(2), cover_m: +p.cover.toFixed(2) } };
  });
  return {
    name, subcropFromCollars: true, geomType: "point", hasZ: true, features, fields: ["unit", "hole_id", "from_m", "cover_m"],
    bbox: features.length ? [x0, y0, x1, y1] : null, styleField: "unit",
    categories: [...counts].sort((a, b) => b[1] - a[1]).map(([u, n]) => ({ value: u, label: u, color: colorOf(u), outline: null, visible: true, count: n })),
    opacity: 0.9, visible: true, drapeMode: "file", elevation: 0,
  };
}

// TASKS.csv #2566 — why holes gave no point: no lithology rows at all, only blank codes, or only cover (overburden / casing / no
// recovery). The notice said 'no logged unit under their cover' for all three (on the review's project 165 had no log, 270 only blanks).
export function subcropLeftOut({ collars, litho, roleOf = roleForLithology }) {
  const rowsBy = new Map();
  for (const r of litho || []) (rowsBy.get(r.hole_id) || rowsBy.set(r.hole_id, []).get(r.hole_id)).push(r);
  let noLog = 0, blankOnly = 0, coverOnly = 0;
  for (const c of collars || []) {
    const rows = rowsBy.get(c.hole_id) || [];
    if (!rows.length) { noLog++; continue; }
    const coded = rows.filter((r) => Number.isFinite(Number(r.from)) && String(r.value ?? "").trim() !== "");
    if (!coded.length) { blankOnly++; continue; }
    if (coded.every((r) => SKIP.has(roleOf(String(r.value).trim())))) coverOnly++;
  }
  return { noLog, blankOnly, coverOnly };
}
