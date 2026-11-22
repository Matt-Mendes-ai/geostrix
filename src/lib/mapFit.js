// TASKS.csv #3989 (Matt, Mount Raymond: 'the 3D model made from the geology map doesn't look like the map: units overflowing, the colours don't
// look right') — what Model from map needs beyond the #758 predicted map: (a) WHERE the model differs from the map (the mapped unit at each terrain
// node beside the model's), drawn as an overlay; (b) each top's orientations taken from the dip measurements NEAR its own contacts (every top
// used to get the whole map's, 1,492 orientations on Mount Raymond: a solve past 15 minutes, and a dip from across the sheet bending a
// top where it is mapped); (c) the map layer's own colour for each unit name. Pure.
import { pointInRings } from "./mapLayers.js";

const norm = (s) => String(s ?? "").trim().toLowerCase();

// (a) the mapped unit at each grid node (null off the map) — the same lookup mapAgreement makes, kept per node
export function mappedUnitsAt(grid, layer, field = layer?.styleField) {
  if (!field || !(layer?.features || []).length) return null;
  const feats = layer.features.map((f) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    (f.parts || []).forEach((p) => p.forEach(([x, y]) => { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }));
    const v = f.attributes?.[field];
    return { parts: f.parts || [], box: [a, b, c, d], unit: v == null || v === "" ? null : String(v) };
  }).filter((f) => f.unit);
  if (!feats.length) return null; // no polygon carries the field: nothing to compare with
  return grid.nodes.map((n) => feats.find((q) => n.x >= q.box[0] && n.x <= q.box[2] && n.y >= q.box[1] && n.y <= q.box[3] && pointInRings([n.x, n.y], q.parts))?.unit ?? null);
}
// the overlay's pixels: where the model's unit at the ground is not the mapped one (a mapped unit the model has, a model unit there), in
// DIFF_COLOUR; agreeing or unmapped nodes clear -> { px (RGBA, the grid's nx x ny), differ, compared }
export const DIFF_COLOUR = [214, 39, 40];
export function differRaster(grid, modelUnits, mapped, modelNames) {
  const known = new Set((modelNames || []).map(norm));
  const px = new Uint8ClampedArray(grid.nx * grid.ny * 4);
  let differ = 0, compared = 0;
  grid.nodes.forEach((n, k) => {
    const m = mapped?.[k], u = modelUnits?.[k];
    if (m == null || u == null || !known.has(norm(m))) return;
    compared++;
    if (norm(m) === norm(u)) return;
    differ++;
    const o = (n.j * grid.nx + n.i) * 4;
    px[o] = DIFF_COLOUR[0]; px[o + 1] = DIFF_COLOUR[1]; px[o + 2] = DIFF_COLOUR[2]; px[o + 3] = 200;
  });
  return { px, differ, compared };
}

// (a) the fit card's numbers in one pass over the grid: per mapped unit the share of its (modelled, in the model box) ground where the model
// has that unit, scored as mapAgreement scores it (only units the model has), overall the same over every scored node, plus the overlay
// -> { overall, units: [{ unit, nodes, pct, modelledAs }] (largest first), unscored: [mapped units the model has not], px, differ, compared }
export function fitToMap(grid, modelUnits, layer, field, modelNames) {
  const mapped = mappedUnitsAt(grid, layer, field);
  if (!mapped) return null;
  const known = new Set((modelNames || []).map(norm));
  const by = new Map();
  mapped.forEach((m, k) => {
    if (m == null) return;
    let e = by.get(m);
    if (!e) by.set(m, (e = { unit: m, nodes: 0, scored: 0, agree: 0, as: new Map() }));
    e.nodes++;
    const u = modelUnits?.[k];
    if (u == null || !known.has(norm(m))) return;
    e.scored++;
    if (norm(u) === norm(m)) e.agree++; else e.as.set(u, (e.as.get(u) || 0) + 1);
  });
  const rows = [...by.values()].sort((p, q) => q.nodes - p.nodes);
  const scored = rows.filter((e) => known.has(norm(e.unit)));
  const n = scored.reduce((s, e) => s + e.scored, 0);
  const { px, differ, compared } = differRaster(grid, modelUnits, mapped, modelNames);
  return {
    overall: n ? scored.reduce((s, e) => s + e.agree, 0) / n : null,
    units: scored.map((e) => ({ unit: e.unit, nodes: e.nodes, pct: e.scored ? e.agree / e.scored : null, modelledAs: [...e.as.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null })),
    unscored: rows.filter((e) => !known.has(norm(e.unit))).map((e) => e.unit),
    px, differ, compared,
  };
}

// (b) a top's orientations: those within radiusM of its own contact points (nearest first, at most maxN), else the nearest `fallback` ones;
// -> { orientations, near: how many were within the radius }
export function orientationsNear(points, orientations, { radiusM = 2000, maxN = 24, fallback = 3, sample = 400 } = {}) {
  const ori = orientations || [], pts = points || [];
  if (!ori.length || !pts.length) return { orientations: ori.slice(0, maxN), near: 0 };
  const step = Math.max(1, Math.floor(pts.length / sample)), probe = pts.filter((_, i) => i % step === 0);
  const d = ori.map((o) => { let best = Infinity; for (const p of probe) { const q = Math.hypot(o.x - p.x, o.y - p.y); if (q < best) best = q; } return { o, d: best }; }).sort((a, b) => a.d - b.d);
  const near = d.filter((e) => e.d <= radiusM);
  return { orientations: (near.length ? near.slice(0, maxN) : d.slice(0, fallback)).map((e) => e.o), near: near.length };
}

// (c) the map layer's colour for a unit (its category, when the layer is styled by the run's unit field), else null
export function mapUnitColour(layer, field, unit) {
  if (!layer || unit == null) return null;
  if (layer.styleField && field && layer.styleField !== field) return null;
  const c = (layer.categories || []).find((q) => String(q.value) === String(unit)) || (layer.categories || []).find((q) => norm(q.value) === norm(unit));
  return typeof c?.color === "string" && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null;
}
