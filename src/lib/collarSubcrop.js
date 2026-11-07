// TASKS.csv #1719 (review #1645, Copley) — a geologist starting a surface map on a drilled prospect wants the collars' top-of-hole
// lithology as subcrop points: the first logged unit under the overburden / casing / no-recovery at the top of each hole, at the
// hole's own position at that depth (an angled hole's bedrock pierce point is not at its collar). A starting map, not a mapped
// outcrop: the points say what the drill met under cover, and where. Pure.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { roleForLithology, colorForLithology } from "./layers.js";

const SKIP = new Set(["overburden", "no recovery"]);

// -> [{ hole_id, unit, from, to, cover (m of skipped intervals above), x, y, z }], one per hole with a logged unit under its cover
export function collarSubcrop({ collars, survey, litho, desurveyMethod, roleOf = roleForLithology }) {
  const byHoleSurvey = new Map(), byHoleLitho = new Map();
  for (const s of survey || []) (byHoleSurvey.get(s.hole_id) || byHoleSurvey.set(s.hole_id, []).get(s.hole_id)).push(s);
  for (const r of litho || []) {
    const f = Number(r.from), t = Number(r.to), v = String(r.value ?? "").trim();
    if (!Number.isFinite(f) || !v) continue;
    (byHoleLitho.get(r.hole_id) || byHoleLitho.set(r.hole_id, []).get(r.hole_id)).push({ from: f, to: Number.isFinite(t) ? t : f, value: v });
  }
  const out = [];
  for (const c of collars || []) {
    const rows = (byHoleLitho.get(c.hole_id) || []).sort((a, b) => a.from - b.from);
    const first = rows.find((r) => !SKIP.has(roleOf(r.value)));
    if (!first) continue;
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
