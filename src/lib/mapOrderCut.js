// TASKS.csv #3936 (Matt: Model from map on Macpass with the Yukon Bedrock Geology Map from Macrostrat stopped with 'GemPy takes at most 16 units ...
// this order has 27') — a regional compiled map easily has more than 16 units round a project, and a beginner cannot tell which to spare. Before the
// run, Model from map OFFERS a cut of the order down to the limit, each choice with its reason, in three steps, each only while the order is over:
//  1. units mapped only OUTSIDE the drilled area (the collars' box plus a margin: a quarter of its width, at least 1 km) are left out: the model
//     is built where the holes are;
//  2. NEIGHBOURS in the order (so the pile keeps its sequence) are merged into one unit when they belong to the same group or formation (the name
//     before ' Gp' / ' Group' / ' Fm' / ' Formation' / ' Suite', or before ':'), then when they carry the same mapped age (the map's age field);
//  3. the units left are ranked by their mapped area inside the drilled area and their length of contact with other units (the evidence a model
//     is fitted to), and the lowest are set to 'other (left out)', listed with their figures.
// Never a deposit style or a rock type: only the map's own names, ages, areas and contacts. Pure.
//
// input: { layer (features with .parts / .geometry rings in metres), field (the unit field), ageField (or null), order (stratigraphic units,
//          youngest first), units (suggestPileOrder's units: { unit }), pairs (its pairs: { a, b, lengthM }), collars ([{ x, y }]), max }
// -> null when the order is within the limit; else { before, after, merge: { member: merged name }, merged: [{ name, members, reason, why }],
//    leftOut: [{ unit, why, reason, areaKm2, contactKm }], kept: [unit], box } — why: 'outside' | 'group' | 'age' | 'rank'
import { GEMPY_MAX_SURFACES } from "./gempyLimits.js";

const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
// a ring clipped to a box (Sutherland-Hodgman, one edge at a time)
function clipRing(ring, [x0, y0, x1, y1]) {
  let pts = ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined);
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]], [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]]];
  for (const [inside, cut] of edges) {
    if (!pts.length) break;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    pts = out;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : [];
}
// the group or formation a unit name belongs to ('Earn Gp' -> 'earn', 'Earn Group: Portrait Lake' -> 'earn group'), or null
export function groupKey(name) {
  const s = String(name || "").replace(/\s*\(.*\)\s*$/, "").trim();
  const colon = s.indexOf(":");
  if (colon > 0) return s.slice(0, colon).trim().toLowerCase();
  const m = /^(.*?)\s+(Gp|Group|Fm|Formation|Suite|Sequence|Complex|Assemblage)\b/i.exec(s);
  return m && m[1].trim() ? `${m[1].trim().toLowerCase()} ${m[2].toLowerCase().replace(/^gp$/, "group").replace(/^fm$/, "formation")}` : null;
}
const groupLabel = (name) => { const s = String(name || "").replace(/\s*\(.*\)\s*$/, "").trim(); const c = s.indexOf(":"); if (c > 0) return s.slice(0, c).trim(); const m = /^(.*?\s+(?:Gp|Group|Fm|Formation|Suite|Sequence|Complex|Assemblage))\b/i.exec(s); return m ? m[1].trim() : s; };

export function cutMapOrder({ layer, field, ageField = null, order = [], units = [], pairs = [], collars = [], max = GEMPY_MAX_SURFACES } = {}) {
  if (!layer || !field || order.length <= max) return null;
  const before = order.length;
  // the drilled area: the collars' box plus a quarter of its width (at least 1 km)
  const cx = (collars || []).map((c) => Number(c.x)).filter(Number.isFinite), cy = (collars || []).map((c) => Number(c.y)).filter(Number.isFinite);
  let box = null, marginM = 0;
  if (cx.length && cy.length) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const v of cx) { if (v < x0) x0 = v; if (v > x1) x1 = v; }
    for (const v of cy) { if (v < y0) y0 = v; if (v > y1) y1 = v; }
    const m = Math.max(1000, 0.25 * Math.max(x1 - x0, y1 - y0));
    box = [x0 - m, y0 - m, x1 + m, y1 + m]; marginM = Math.round(m);
  }
  // each unit's mapped area inside the drilled area (all of it when there are no collars), and its age
  const inside = new Map(), age = new Map();
  for (const f of layer.features || []) {
    const u = String(f.attributes?.[field] ?? "").trim();
    if (!u) continue;
    const rings = f.parts || [f.geometry];
    let a = 0;
    rings.forEach((r, i) => { if (!Array.isArray(r) || r.length < 4) return; const c = box ? clipRing(r, box) : r; const v = c.length ? ringArea(c) : 0; a += i === 0 ? v : -v; });
    inside.set(u, (inside.get(u) || 0) + Math.max(0, a));
    if (ageField && !age.has(u)) { const g = String(f.attributes?.[ageField] ?? "").trim(); if (g) age.set(u, g); }
  }
  const contactM = new Map();
  for (const p of pairs || []) { const L = Number(p.lengthM) || 0; contactM.set(p.a, (contactM.get(p.a) || 0) + L); contactM.set(p.b, (contactM.get(p.b) || 0) + L); }
  const km2 = (u) => (inside.get(u) || 0) / 1e6, ckm = (u) => (contactM.get(u) || 0) / 1000;
  const leftOut = [], merged = [], merge = {};
  let cur = order.slice();
  // 1. only outside the drilled area
  if (box) {
    for (const u of cur) if (!(inside.get(u) > 0)) leftOut.push({ unit: u, why: "outside", areaKm2: 0, contactKm: +ckm(u).toFixed(1) });
    cur = cur.filter((u) => inside.get(u) > 0);
  }
  // 2. neighbours of one group / formation, then of one age, merged (one pass per rule, largest runs first, while over)
  const mergeBy = (keyOf, why) => {
    if (cur.length <= max) return;
    const runs = [];
    for (let i = 0; i < cur.length;) { const k = keyOf(cur[i]); let j = i + 1; while (k && j < cur.length && keyOf(cur[j]) === k) j++; if (k && j - i > 1) runs.push([i, j, k]); i = j; }
    runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    const take = new Map(); // start index -> [end, name]
    let n = cur.length;
    for (const [i, j] of runs) { if (n <= max) break; const members = cur.slice(i, j); const name = why === "group" ? groupLabel(members[0]) : `${age.get(members[0])} units` /* project data: English */; take.set(i, [j, name]); n -= j - i - 1; }
    if (!take.size) return;
    const next = [];
    for (let i = 0; i < cur.length;) {
      const t = take.get(i);
      if (!t) { next.push(cur[i]); i++; continue; }
      const [j, name0] = t, members = cur.slice(i, j);
      const name = next.includes(name0) || cur.slice(j).includes(name0) ? `${name0} (${members.length})` : name0;
      for (const m of members) merge[m] = name;
      merged.push({ name, members, why, key: why === "age" ? age.get(members[0]) : groupLabel(members[0]) });
      next.push(name); i = j;
    }
    cur = next;
  };
  mergeBy((u) => groupKey(u), "group");
  if (ageField) mergeBy((u) => age.get(u) || null, "age");
  // 3. the rest ranked by mapped area inside the drilled area and contact length; the lowest left out
  if (cur.length > max) {
    const areaOf = (u) => (merged.find((m) => m.name === u)?.members || [u]).reduce((s, x) => s + km2(x), 0);
    const contOf = (u) => (merged.find((m) => m.name === u)?.members || [u]).reduce((s, x) => s + ckm(x), 0);
    let A = 1e-9, C = 1e-9;
    for (const u of cur) { const a = areaOf(u), c = contOf(u); if (a > A) A = a; if (c > C) C = c; }
    const score = (u) => areaOf(u) / A + contOf(u) / C;
    const keep = new Set([...cur].sort((a, b) => score(b) - score(a)).slice(0, max));
    for (const u of cur) if (!keep.has(u)) {
      const members = merged.find((m) => m.name === u)?.members;
      if (members) { for (const x of members) { delete merge[x]; leftOut.push({ unit: x, why: "rank", areaKm2: +km2(x).toFixed(2), contactKm: +ckm(x).toFixed(1) }); } merged.splice(merged.findIndex((m) => m.name === u), 1); }
      else leftOut.push({ unit: u, why: "rank", areaKm2: +areaOf(u).toFixed(2), contactKm: +contOf(u).toFixed(1) });
    }
    cur = cur.filter((u) => keep.has(u));
  }
  return { before, after: cur.length, kept: cur, merge, merged, leftOut, box, marginM };
}

// the map layer with merged units under their merged name (a copy: the project's layer is not changed), for the suggestion and the run
export function mergeUnits(layer, field, merge) {
  if (!layer || !field || !merge || !Object.keys(merge).length) return layer;
  return { ...layer, features: (layer.features || []).map((f) => { const u = String(f.attributes?.[field] ?? "").trim(), m = merge[u]; return m ? { ...f, attributes: { ...f.attributes, [field]: m } } : f; }) };
}
