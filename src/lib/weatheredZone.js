// TASKS.csv #2597 (review #2486, WA lithium) — the base of the weathered zone from the project's Weathering log: in each hole, the depth below
// its collar of the top of the first interval logged with the code chosen as fresh rock (FR). A hole whose log never reaches it says nothing
// (counted apart). The pit interpolates these depths between the holes (pitShell.js weatheredOf). Pure.
import { pointOnTrace } from "./desurvey.js";

// rows: Weathering intervals { hole_id, from, to, value }; traces: Map hole_id -> trace; fresh: the code of fresh rock (case folded)
// -> { points: [{ x, y, depth }], logged, without, median, min, max }
export function weatheredBasePoints(rows, traces, fresh) {
  const want = String(fresh || "").trim().toUpperCase(), first = new Map(), logged = new Set();
  for (const r of rows || []) {
    const t = traces.get(r.hole_id), from = Number(r.from);
    if (!t || !Number.isFinite(from)) continue;
    logged.add(r.hole_id);
    if (String(r.value ?? "").trim().toUpperCase() !== want) continue;
    if (!first.has(r.hole_id) || from < first.get(r.hole_id)) first.set(r.hole_id, from);
  }
  const points = [];
  for (const [h, from] of first) {
    const t = traces.get(h), top = t[0], p = pointOnTrace(t, from);
    if (top && Number.isFinite(p?.z)) points.push({ x: p.x, y: p.y, depth: Math.max(0, top.z - p.z) }); // where the hole meets it
  }
  const d = points.map((p) => p.depth).sort((a, b) => a - b);
  return { points, logged: logged.size, without: logged.size - points.length, median: d.length ? d[d.length >> 1] : null, min: d.length ? d[0] : null, max: d.length ? d[d.length - 1] : null };
}
// the codes of the Weathering log, most logged first
export function weatheringCodes(rows) {
  const n = new Map();
  for (const r of rows || []) { const c = String(r.value ?? "").trim().toUpperCase(); if (c) n.set(c, (n.get(c) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
