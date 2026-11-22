// TASKS.csv #3985 (Matt, Mount Raymond: Model from map stopped with 'GemPy takes at most 6 faults in one model, and this run has 15') — a regional
// map easily has more faults than the engine takes, named 'thrust 2' ... 'thrust 15' or by a cut-off description, and a beginner cannot tell
// which to drop. As #3936 does for the units, Model from map OFFERS to pick the ones that matter, each with its reason:
//  0. collinear pieces of one fault (same type, strike within 15 degrees, ends within 200 m) are merged first, so a fault cut into pieces counts once
//  1. faults inside the model area (the collars' box plus a margin, as #3936; with no holes the map's own extent) before those only outside it
//  2. the longest mapped trace inside the area
//  3. the most map units offset across it (unit pairs that differ on its two sides)
//  4. mapped as major (a continuous / major fault, a thrust or reverse fault) over minor ('one of several small', 'appears to', 'inferred')
// Never a deposit style: only the map's own lines, names, units and lengths. Also the fault's type from its attributes and a dip default from it
// (thrust about 30 degrees, normal about 60, else 45), marked as a default. Pure.
import { GEMPY_MAX_FAULTS } from "./gempyLimits.js";

const text = (f) => Object.values(f?.attributes || {}).filter((v) => typeof v === "string").join(" ");
// the fault's type from its attributes: "thrust" | "reverse" | "normal" | "strike-slip" | "fault"
export function faultType(f) {
  const t = text(f).toLowerCase();
  if (/thrust/.test(t)) return "thrust";
  if (/reverse/.test(t)) return "reverse";
  if (/normal|extensional|listric/.test(t)) return "normal";
  if (/strike[- ]?slip|dextral|sinistral|transcurrent|wrench/.test(t)) return "strike-slip";
  return "fault";
}
// the dip a type suggests (a default the user can change): thrust 30, reverse 45, normal 60, strike-slip 85, else 45
export const DIP_DEFAULT = { thrust: 30, reverse: 45, normal: 60, "strike-slip": 85, fault: 45 };
export const dipDefault = (type) => DIP_DEFAULT[type] ?? 45;
// mapped as a major structure (true), a minor one (false), or not said (null). Words about its size win ('continuous', 'major' / 'minor',
// 'one of several small'); then a thrust or reverse fault counts as major; a doubt about where it runs ('inferred', 'approximate') as minor.
// 'appears to' is not a size: 'appears to be steeply east-dipping reverse fault' is about its dip.
export function faultMajor(f) {
  const t = text(f).toLowerCase();
  if (/continuous|major|regional|main fault|crustal|terrane/.test(t)) return true;
  if (/minor|one of several small|small fault/.test(t)) return false;
  if (/thrust|reverse/.test(t)) return true;
  if (/inferred|approximate|possible|probable|concealed/.test(t)) return false;
  return null;
}

export const lineLength = (line) => { let s = 0; for (let i = 1; i < (line || []).length; i++) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); return s; };
const strikeOf = (line) => { const a = line[0], b = line[line.length - 1]; return ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 180; };
const angleDiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
const endGap = (p, q) => { const ends = (l) => [l[0], l[l.length - 1]]; let m = Infinity; for (const a of ends(p)) for (const b of ends(q)) m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1])); return m; };

// how far a point lies off a line's straight trend (its first to last point), in metres
const offLine = (line, p) => { const a = line[0], b = line[line.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L; };
// collinear pieces of one fault: [{ i, line, type }] -> groups [[i, ...]] (union-find; same type, strike within 15 degrees, ends within 200 m,
// and on one trend: the other piece's ends within 100 m of the line through this one, so two parallel faults side by side stay apart)
export function mergeCollinear(faults, { strikeDeg = 15, gapM = 200, sideM = 100 } = {}) {
  const up = new Map(faults.map((f) => [f.i, f.i])), find = (x) => (up.get(x) === x ? x : find(up.get(x)));
  for (let a = 0; a < faults.length; a++) for (let b = a + 1; b < faults.length; b++) {
    const p = faults[a], q = faults[b];
    if (p.type !== q.type || angleDiff(strikeOf(p.line), strikeOf(q.line)) > strikeDeg || endGap(p.line, q.line) > gapM) continue;
    if (Math.min(offLine(p.line, q.line[0]), offLine(p.line, q.line[q.line.length - 1])) > sideM) continue;
    up.set(find(p.i), find(q.i));
  }
  const groups = new Map();
  for (const f of faults) { const r = find(f.i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f.i); }
  return [...groups.values()];
}
// one polyline from a group's pieces, in order along their strike (the engine takes one trace per fault)
export function joinPieces(lines) {
  if (lines.length === 1) return lines[0];
  const s = (strikeOf(lines[0]) * Math.PI) / 180, ax = Math.sin(s), ay = Math.cos(s), proj = (p) => p[0] * ax + p[1] * ay;
  return lines.map((l) => (proj(l[0]) <= proj(l[l.length - 1]) ? l : [...l].reverse())).sort((a, b) => proj(a[0]) - proj(b[0])).flat();
}

// the model area: the collars' box plus a quarter of its width (at least 1 km), else the map layer's extent
export function modelArea(collars, layer) {
  const cs = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  if (cs.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cs) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
    const m = Math.max(1000, 0.25 * Math.max(x1 - x0, y1 - y0));
    return [x0 - m, y0 - m, x1 + m, y1 + m];
  }
  return Array.isArray(layer?.bbox) && layer.bbox.length === 4 ? layer.bbox : null;
}
// the length of a polyline inside a box (each segment clipped, Liang-Barsky)
export function lengthInside(line, box) {
  if (!box) return lineLength(line);
  const [x0, y0, x1, y1] = box; let s = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], dx = line[i][0] - ax, dy = line[i][1] - ay; let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (ok && t1 > t0) s += (t1 - t0) * Math.hypot(dx, dy);
  }
  return s;
}

// the map unit at a point (the first polygon of the unit layer holding it; holes respected), or null
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
export function unitAt(polys, x, y) {
  for (const p of polys) {
    if (x < p.bb[0] || x > p.bb[2] || y < p.bb[1] || y > p.bb[3]) continue;
    if (!inRing(p.rings[0], x, y)) continue;
    if (p.rings.slice(1).some((h) => inRing(h, x, y))) continue;
    return p.unit;
  }
  return null;
}
export function unitPolys(layer, field) {
  const out = [];
  for (const f of layer?.features || []) {
    const u = f.attributes?.[field]; if (u == null || u === "") continue;
    const rings = (f.parts || (f.geometry ? [f.geometry] : [])).filter((r) => Array.isArray(r) && r.length >= 4);
    if (!rings.length) continue;
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of rings[0]) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    out.push({ unit: String(u), rings, bb });
  }
  return out;
}
// the unit pairs that differ across a trace: samples along it (every 1/24 of its length), the units a little to each side -> count of pairs
export function unitsOffset(line, polys, sideM = 60) {
  const pairs = new Set(), L = lineLength(line);
  if (!(L > 0) || !polys.length) return 0;
  const N = 24;
  for (let k = 0; k <= N; k++) {
    let d = (k / N) * L, i = 1;
    while (i < line.length - 1 && d > Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])) { d -= Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); i++; }
    const a = line[i - 1], b = line[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = Math.min(1, d / sl);
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, nx = -(b[1] - a[1]) / sl, ny = (b[0] - a[0]) / sl;
    const l = unitAt(polys, x + nx * sideM, y + ny * sideM), r = unitAt(polys, x - nx * sideM, y - ny * sideM);
    if (l && r && l !== r) pairs.add([l, r].sort().join("|"));
  }
  return pairs.size;
}

// the pick: faults [{ i, line, type, major }] (the ticked ones), the map's units (layer, field), the collars -> null within the limit, else
// { before, keep: [entry], drop: [entry], groups, box } — entry: one fault { ids (its merged pieces), type, insideM, offset (unit pairs), major (1 / 0 / -1), pieces }
export function pickFaults({ faults = [], layer = null, field = null, collars = [], max = GEMPY_MAX_FAULTS } = {}) {
  const groups = mergeCollinear(faults);
  if (groups.length <= max && faults.length <= max) return null;
  const byI = new Map(faults.map((f) => [f.i, f])), box = modelArea(collars, layer), polys = field ? unitPolys(layer, field) : [];
  const rows = groups.map((ids) => {
    const fs = ids.map((i) => byI.get(i)), line = joinPieces(fs.map((f) => f.line));
    const inside = fs.reduce((s, f) => s + lengthInside(f.line, box), 0), total = fs.reduce((s, f) => s + lineLength(f.line), 0);
    const major = fs.some((f) => f.major === true) ? 1 : fs.every((f) => f.major === false) ? -1 : 0;
    return { ids, type: fs[0].type, inside, total, offset: unitsOffset(line, polys), major };
  });
  rows.sort((a, b) => (b.inside > 0) - (a.inside > 0) || Math.round(b.inside / 100) - Math.round(a.inside / 100) || b.offset - a.offset || b.major - a.major || b.total - a.total);
  const entry = (r) => ({ ids: r.ids, type: r.type, insideM: Math.round(r.inside), offset: r.offset, major: r.major, pieces: r.ids.length }); // the panel words the reason
  return { before: groups.length, box, groups, keep: rows.slice(0, max).map(entry), drop: rows.slice(max).map(entry) };
}
