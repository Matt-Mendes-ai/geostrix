// TASKS.csv #2921 (review #2876, WA bedded iron) — explicit tops of one pile were each fitted alone: Top of ONAM lay above Top of SONAM
// under 85 of 215 holes, 'Check relationships' said 'Nothing to check', a unit missing from a hole told the fit nothing, and the
// Solid blocks found the tops crossing in 2,356 of 7,770 columns. The holes already know the order (the Strat. stack's check,
// #2382); these helpers take it from them, for the Explicit surface pane:
//  - pileFromRuns / pileRelation: which of two units the holes put above the other, and in how many of the holes logging both;
//  - absentTops: where a unit is missing from a hole that passes from a younger unit straight into an older one, its top is that
//    contact (zero thickness there), for 'Add the logged tops' to offer as picks;
//  - upperNeighbour / lowerNeighbour (#3113): the next top up or down among the pane's other explicit tops;
//  - meshHeightLookup / clampUnder / orderAgainst: hold a surface at or under that top, or count where it lies above it.
// Pure: no React, no three.js.
import { stackOrderFromHoles } from "./stackOrderFromHoles.js";

// runs: modellingCodes.codedRuns' runs ({ hole_id, code, from, ... }); inPile(code) -> true for the codes of the pile (stratigraphic)
// -> { codes, kOf: Map(code -> index), above: n x n counts (holes where code a first starts above code b) }
export function pileFromRuns(runs, inPile = () => true) {
  const codes = [...new Set((runs || []).map((r) => r.code).filter((c) => c != null && c !== "" && inPile(c)))];
  const kOf = new Map(codes.map((c, i) => [c, i]));
  const rows = (runs || []).filter((r) => kOf.has(r.code)).map((r) => ({ hole_id: r.hole_id, from: r.from, value: r.code }));
  const { above } = stackOrderFromHoles(rows, kOf, codes.length);
  return { codes, kOf, above };
}

// -> { order: 1 (the holes put a above b), -1 (b above a), 0 (not decided), agree, of }: decided when at least `minHoles` holes log
// both and `share` of them agree (the Strat. stack's own rule, #2382)
export function pileRelation(pile, a, b, { minHoles = 3, share = 2 / 3 } = {}) {
  const i = pile?.kOf?.get(a), j = pile?.kOf?.get(b);
  if (i === undefined || j === undefined || i === j) return { order: 0, agree: 0, of: 0 };
  const ab = pile.above[i][j], ba = pile.above[j][i], of = ab + ba;
  if (of < minHoles) return { order: 0, agree: Math.max(ab, ba), of };
  if (ab >= share * of) return { order: 1, agree: ab, of };
  if (ba >= share * of) return { order: -1, agree: ba, of };
  return { order: 0, agree: Math.max(ab, ba), of };
}

// Where `unit` is missing from a hole: down the hole, the first run of a unit the holes put under `unit`, when the run right above it
// touches it (no gap, not a hole start) and is a unit the holes put above `unit`. That contact is where `unit` would start: its top,
// at zero thickness. A hole that logs `unit` anywhere is left to the logged tops. -> { tops: [{ hole_id, md, above, below, absent }],
// holes: the holes missing `unit` that pass through its place }
export function absentTops(runs, unit, pile, opts = {}) {
  const logs = new Set();
  for (const r of runs || []) if (r.code === unit) logs.add(r.hole_id);
  const rel = new Map(); // code -> pileRelation(unit, code).order, cached
  const order = (c) => { if (!rel.has(c)) rel.set(c, pileRelation(pile, unit, c, opts).order); return rel.get(c); };
  const tops = [], done = new Set();
  for (const r of runs || []) { // codedRuns lists each hole's runs top-down
    if (logs.has(r.hole_id) || done.has(r.hole_id)) continue;
    if (order(r.code) !== 1) continue; // not a unit under `unit`
    done.add(r.hole_id); // only the first older run of the hole
    if (!r.above || r.holeStart) continue;
    if (order(r.above.code) !== -1) continue; // what lies on it is not a unit above `unit`
    tops.push({ hole_id: r.hole_id, md: r.from, above: r.above.code, below: r.code, absent: true });
  }
  return { tops, holes: tops.length };
}

// The next top up: among `candidates` ([{ unit, ... }], the pane's other explicit tops), those the holes put above `unit`, and of
// them the one the holes put under the most others (the closest above). -> { ...candidate, rel } or null
export function upperNeighbour(pile, unit, candidates, opts = {}) {
  const ups = [];
  for (const c of candidates || []) {
    if (!c || c.unit === unit) continue;
    const rel = pileRelation(pile, c.unit, unit, opts);
    if (rel.order === 1) ups.push({ ...c, rel });
  }
  if (!ups.length) return null;
  const under = ups.map((c) => ups.reduce((k, d) => k + (d !== c && pileRelation(pile, d.unit, c.unit, opts).order === 1 ? 1 : 0), 0));
  let best = 0;
  for (let i = 1; i < ups.length; i++) if (under[i] > under[best] || (under[i] === under[best] && ups[i].rel.agree > ups[best].rel.agree)) best = i;
  return ups[best];
}

// TASKS.csv #3113 — the mirror: the next top DOWN among the candidates (the holes put `unit` above it), the closest one (the most other
// candidates under it); null when none is decided under `unit`
export function lowerNeighbour(pile, unit, candidates, opts = {}) {
  const downs = [];
  for (const c of candidates || []) {
    if (!c || c.unit === unit) continue;
    const rel = pileRelation(pile, unit, c.unit, opts);
    if (rel.order === 1) downs.push({ ...c, rel });
  }
  if (!downs.length) return null;
  const over = downs.map((c) => downs.reduce((k, d) => k + (d !== c && pileRelation(pile, c.unit, d.unit, opts).order === 1 ? 1 : 0), 0));
  let best = 0;
  for (let i = 1; i < downs.length; i++) if (over[i] > over[best] || (over[i] === over[best] && downs[i].rel.agree > downs[best].rel.agree)) best = i;
  return downs[best];
}

// TASKS.csv #3115 — the tops down the pile from `first` (a candidate): each next one the closest under the last by the holes' order,
// among the candidates not yet taken. pileOf(unit) -> the pile for that unit (topsOfUnit(unit).pile). -> [first, ...] (at most `max`)
export function pileBelow(first, candidates, pileOf, { max = 40 } = {}) {
  const out = [], seen = new Set();
  let cur = first;
  while (cur && !seen.has(cur.id) && out.length < max) {
    seen.add(cur.id); out.push(cur);
    const pile = pileOf(cur.unit);
    if (!pile) break;
    cur = lowerNeighbour(pile, cur.unit, (candidates || []).filter((c) => !seen.has(c.id)));
  }
  return out;
}

// The elevation of a triangle mesh (positions: x, y map, z elevation triples) at a map point: the highest crossing, NaN off it. A
// bucket grid of the triangles' plan boxes, about `perCell` triangles a bucket.
export function meshHeightLookup(positions, indices, { perCell = 4 } = {}) {
  const P = positions, nT = Math.floor((indices?.length || 0) / 3);
  if (!nT) return () => NaN;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const side = Math.max(1, Math.round(Math.sqrt(nT / perCell)));
  const cw = (x1 - x0) / side || 1, ch = (y1 - y0) / side || 1;
  const buckets = Array.from({ length: side * side }, () => []);
  const cx = (x) => Math.min(side - 1, Math.max(0, Math.floor((x - x0) / cw))), cy = (y) => Math.min(side - 1, Math.max(0, Math.floor((y - y0) / ch)));
  for (let t = 0; t < nT; t++) {
    const a = indices[3 * t] * 3, b = indices[3 * t + 1] * 3, c = indices[3 * t + 2] * 3;
    const i0 = cx(Math.min(P[a], P[b], P[c])), i1 = cx(Math.max(P[a], P[b], P[c])), j0 = cy(Math.min(P[a + 1], P[b + 1], P[c + 1])), j1 = cy(Math.max(P[a + 1], P[b + 1], P[c + 1]));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * side + i].push(t);
  }
  return (x, y) => {
    if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return NaN;
    let z = NaN;
    for (const t of buckets[cy(y) * side + cx(x)]) {
      const a = indices[3 * t] * 3, b = indices[3 * t + 1] * 3, c = indices[3 * t + 2] * 3;
      const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], qx = P[c], qy = P[c + 1];
      const det = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((by - qy) * (x - qx) + (qx - bx) * (y - qy)) / det, l2 = ((qy - ay) * (x - qx) + (ax - qx) * (y - qy)) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const zz = l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2];
      if (!(z >= zz)) z = zz;
    }
    return z;
  };
}

// Lower every vertex that lies above the upper surface onto it (zero thickness between the two there). positions are changed in place.
// -> { moved, maxM, compared (vertices under the upper surface's footprint) }
export function clampUnder(positions, upperAt) {
  let moved = 0, maxM = 0, compared = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const zu = upperAt(positions[i], positions[i + 1]);
    if (!Number.isFinite(zu)) continue;
    compared++;
    const d = positions[i + 2] - zu;
    if (d > 1e-6) { positions[i + 2] = zu; moved++; if (d > maxM) maxM = d; }
  }
  return { moved, maxM, compared };
}

// Where a surface lies above the upper one (the order check, without changing anything). points: [{ x, y, z }] or positions triples.
// tolM: a crossing under it is a touch, not out of order. -> { compared, above, worstM, worstAt: { x, y } | null }
export function orderAgainst(positions, upperAt, { tolM = 0.05 } = {}) {
  let compared = 0, above = 0, worstM = 0, worstAt = null;
  for (let i = 0; i < positions.length; i += 3) {
    const zu = upperAt(positions[i], positions[i + 1]);
    if (!Number.isFinite(zu)) continue;
    compared++;
    const d = positions[i + 2] - zu;
    if (d > tolM) { above++; if (d > worstM) { worstM = d; worstAt = { x: positions[i], y: positions[i + 1] }; } }
  }
  return { compared, above, worstM, worstAt };
}

// TASKS.csv #2926 (review #2876, WA iron) — the order the holes give, for any list of units: the stack's own check (#2382) found it and then
// said 'Reorder the units with the arrows'. rows: [{ hole_id, from, value }] (Lithology rows, or coded runs as { value: code }); codesOf:
// unit -> the logged values that are that unit. -> { order: units youngest first (ties and units the holes do not place: as given),
// conflicts: stackOrderFromHoles' pairs the given order has the other way up, placed: how many units the holes log }
export function orderFromHoles(rows, units, codesOf = (u) => [u]) {
  const kOf = new Map();
  (units || []).forEach((u, i) => { for (const c of codesOf(u) || []) if (!kOf.has(c)) kOf.set(c, i); });
  const { above, conflicts, order } = stackOrderFromHoles(rows, kOf, (units || []).length);
  const placed = above.filter((row, a) => row.some((v, b) => v + above[b][a] > 0)).length;
  return { order: order.map((k) => units[k]), conflicts, placed };
}

// the moves (unit, -1 = one step up) that turn `from` into `to`, one neighbour swap at a time (a list's up / down arrows)
export function movesToOrder(from, to) {
  const cur = [...from], moves = [];
  to.forEach((u, i) => { let j = cur.indexOf(u); while (j > i) { moves.push([u, -1]); [cur[j - 1], cur[j]] = [cur[j], cur[j - 1]]; j--; } });
  return moves;
}

// TASKS.csv #2927 (review #2876, WA bedded iron) — a unit that comes back down its holes was always described as a steep body, intrusive sheets
// or a vein ('SONAM repeats in 26 % of the holes … Veins / dykes models it'), where on a flat banded pile the repeats are 2 m interbeds of its
// stack neighbours (SONAM / ONAM / SONAM). For the holes that repeat the unit: which logged units lie between its first and last run.
// rowsOf(hole) -> that hole's Lithology rows; isUnit(value) -> the row is the unit. -> [{ code, holes }] most holes first, and `of` (the holes)
export function interbeds(holes, rowsOf, isUnit) {
  const count = new Map();
  let of = 0;
  for (const h of holes || []) {
    const rows = (rowsOf(h) || []).filter((r) => Number.isFinite(Number(r.from))).sort((a, b) => Number(a.from) - Number(b.from));
    const first = rows.findIndex((r) => isUnit(r.value));
    let last = -1;
    for (let i = rows.length - 1; i >= 0; i--) if (isUnit(rows[i].value)) { last = i; break; }
    if (first < 0 || last <= first) continue;
    of++;
    const seen = new Set();
    for (let i = first + 1; i < last; i++) { const v = rows[i].value; if (!isUnit(v) && v != null && v !== "") seen.add(String(v)); }
    for (const v of seen) count.set(v, (count.get(v) || 0) + 1);
  }
  const list = [...count].map(([code, n]) => ({ code, holes: n })).sort((a, b) => b.holes - a.holes || (a.code < b.code ? -1 : 1));
  list.of = of;
  return list;
}

// the dip of the least-squares plane z = a + b x + c y through points { x, y, z } (degrees), NaN with fewer than 3 or in a line
export function planeDipDeg(points) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (P.length < 3) return NaN;
  let mx = 0, my = 0, mz = 0;
  for (const p of P) { mx += p.x; my += p.y; mz += p.z; }
  mx /= P.length; my /= P.length; mz /= P.length;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of P) { const x = p.x - mx, y = p.y - my, z = p.z - mz; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; }
  const det = sxx * syy - sxy * sxy;
  if (!(Math.abs(det) > 1e-9 * (sxx * syy || 1))) return NaN;
  const b = (sxz * syy - syz * sxy) / det, c = (syz * sxx - sxz * sxy) / det;
  return (Math.atan(Math.hypot(b, c)) * 180) / Math.PI;
}

// TASKS.csv #3262 — the RMS distance (m, in z) of the points from that least-squares plane; NaN as planeDipDeg
export function planeMisfitM(points) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (!Number.isFinite(planeDipDeg(P))) return NaN;
  let mx = 0, my = 0, mz = 0;
  for (const p of P) { mx += p.x; my += p.y; mz += p.z; }
  mx /= P.length; my /= P.length; mz /= P.length;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of P) { const x = p.x - mx, y = p.y - my, z = p.z - mz; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; }
  const det = sxx * syy - sxy * sxy, b = (sxz * syy - syz * sxy) / det, c = (syz * sxx - sxz * sxy) / det;
  let ss = 0;
  for (const p of P) { const r = p.z - mz - b * (p.x - mx) - c * (p.y - my); ss += r * r; }
  return Math.sqrt(ss / P.length);
}

// TASKS.csv #3262 (review #3195, Galore Creek) — 'thin beds of its neighbours in a flat pile' was concluded from the first tops' dip alone:
// intrusive phases met by inclined holes collared at similar elevations have first tops that are flat ON AVERAGE (5.6°) but scattered far
// off any one plane. A flat pile's first tops lie close to their plane: within twice the unit's median run (10 m at least). A unit whose
// role cuts across (a Modelling codes intrusion / cross-cutting; a dyke, vein, breccia or fault) is never read as a pile.
const NOT_A_PILE = new Set(["intrusion", "cross-cutting", "dyke", "vein", "breccia", "fault"]);
export function looksLikeFlatPile({ dip, misfit, medianRunM, role }) {
  if (NOT_A_PILE.has(role)) return false;
  return Number.isFinite(dip) && dip <= 15 && Number.isFinite(misfit) && misfit <= Math.max(10, 2 * (Number(medianRunM) || 0));
}

// TASKS.csv #3263 (review #3195, Galore Creek) — Closed body flattened its cells (80 x 80 x 4 m) for any unit 'logged in thin runs' over a wide
// area: an intrusive met by holes inclined 55-85° became a stack of flat plates. Flat cells only when the runs line up along a near-flat
// layer: the inside points' plane dips 30° or less and they lie within max(20 m, 4 x the median run) of it, and the role does not cut
// across. WA uranium's lignite (#2384): 0.1°, 4.6 m off its plane; its flat sands and clays 15-20 m. -> { flat, dip, misfit }
export function runsLieFlat(points, medianRunM, role = null) {
  const dip = planeDipDeg(points), misfit = planeMisfitM(points);
  const flat = !NOT_A_PILE.has(role) && Number.isFinite(dip) && dip <= 30 && Number.isFinite(misfit) && misfit <= Math.max(20, 4 * (Number(medianRunM) || 0));
  return { flat, dip, misfit };
}
