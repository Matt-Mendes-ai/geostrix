// TASKS.csv #4006 — a fault surface from every kind of fault evidence a project holds, not only the oriented picks the Structures tool reads:
//   pick     oriented fault picks in core (a dip and a dip direction at a depth)          -> on-fault points + orientations
//   logged   logged fault intervals (FLT, FZ, gouge, shear zone...): top and bottom      -> on-fault points, no orientation
//   outcrop  fault measurements at outcrop (Geological Mapping's structures)              -> points + orientations
//   mapped   fault lines of a geological map, at the terrain, with the map's dip or a dip   -> points + orientations
//   drawn    interpretation lines drawn as a fault, at the terrain or at a level (RL)     -> points (+ orientations when the line has a dip)
//   string   fault strings drawn on sections                                              -> points
// Each source becomes evidence ITEMS (one per structure name, code, line or string); the user groups items into faults; faultSpec() merges a
// fault's items into the points and orientations an implicit solve takes, fitting a plane when no item carries an orientation, and says
// when the fault is a guess. Pure: the caller places picks and intervals on the hole traces and gives the ground; one frame throughout.

import { faultType, dipDefault, lineLength } from "./faultPick.js";
import { FAULT_TEXT, isFaultCode } from "./faultInventory.js";

export const LINE_STEP_M = 250; // a mapped trace every 250 m, its dip about every km, as Model from map (2 to 8 orientations a line)
export const GUESS_POINTS = 5; // fewer on-fault points than this, or one kind of evidence from one place: the fault is a guess

const finite = (...v) => v.every(Number.isFinite);
const deg = (r) => (r * 180) / Math.PI;
const norm360 = (a) => ((a % 360) + 360) % 360;

// points along a polyline every `step` (a short line in at least 4 steps), its last vertex kept
export function thinLine(line, step = LINE_STEP_M) {
  const L = lineLength(line);
  if (!line?.length) return [];
  const s = Math.max(25, Math.min(step, L / 4 || step));
  const out = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = s - acc;
    while (t <= d) { const f = t / d; out.push(a.map((v, k) => v + (b[k] - v) * f)); t += s; }
    acc = (acc + d) % s;
  }
  const end = line[line.length - 1], last = out[out.length - 1];
  if (Math.hypot(end[0] - last[0], end[1] - last[1]) > 1) out.push(end);
  return out;
}

// the 3x3 symmetric eigen-decomposition (Jacobi): -> { values: [l0 >= l1 >= l2], vectors: [v0, v1, v2] }
function eigen3(A) {
  const a = A.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return { values: idx.map((i) => a[i][i]), vectors: idx.map((i) => [v[0][i], v[1][i], v[2][i]]) };
}

// the least-squares plane through points: -> { centroid, normal (upward), dip, dipDir, rms, flat (the points span no plane: a line or a spot) }
export function fitPlane(points) {
  const P = (points || []).filter((p) => finite(p.x, p.y, p.z));
  if (P.length < 3) return { flat: true, n: P.length };
  const c = { x: 0, y: 0, z: 0 };
  for (const p of P) { c.x += p.x; c.y += p.y; c.z += p.z; }
  c.x /= P.length; c.y /= P.length; c.z /= P.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] /= P.length;
  const { values, vectors } = eigen3(C);
  let n = vectors[2];
  if (n[2] < 0) n = n.map((x) => -x);
  const spread1 = Math.sqrt(Math.max(0, values[1])), spread0 = Math.sqrt(Math.max(0, values[0]));
  const flat = !(spread0 > 1e-6) || spread1 < Math.max(1, 0.02 * spread0); // the points lie along a line (one draped trace, one hole): no plane
  const dip = deg(Math.acos(Math.min(1, Math.abs(n[2]))));
  const dipDir = norm360(deg(Math.atan2(n[0], n[1])));
  return { centroid: c, normal: n, dip, dipDir, rms: Math.sqrt(Math.max(0, values[2])), flat, n: P.length };
}

// a mapped fault's dip: the map's own (a dip attribute), else the nearest outcrop fault within 500 m (its side too), else the type's default
export function mappedFaultAttitude(feature, line, outcropFaults = [], nearM = 500) {
  const a = feature?.attributes || {};
  const dipAttr = Number(Object.entries(a).find(([k]) => /^dip$|^dip_?(angle|deg)$/i.test(k))?.[1]);
  const dirAttr = Number(Object.entries(a).find(([k]) => /^(dip_?dir(ection)?|dipdir|dd)$/i.test(k))?.[1]);
  const p0 = line[0], p1 = line[line.length - 1];
  const strike = deg(Math.atan2(p1[0] - p0[0], p1[1] - p0[1]));
  const perp = [norm360(strike + 90), norm360(strike - 90)];
  let near = null, best = nearM;
  const toSeg = (m, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((m.x - a[0]) * dx + (m.y - a[1]) * dy) / L2)) : 0; return Math.hypot(m.x - a[0] - t * dx, m.y - a[1] - t * dy); };
  for (const m of outcropFaults) for (let i = 0; i < line.length; i++) { const d = i ? toSeg(m, line[i - 1], line[i]) : Math.hypot(m.x - line[0][0], m.y - line[0][1]); if (d < best) { best = d; near = m; } } // along the trace, not only at its vertices
  const angle = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
  const side = near && Number.isFinite(near.dipDir) ? (angle(near.dipDir, perp[0]) <= angle(near.dipDir, perp[1]) ? 0 : 1) : 0;
  if (Number.isFinite(dipAttr)) return { dip: dipAttr, dipDir: Number.isFinite(dirAttr) ? dirAttr : perp[side], source: "map" };
  if (near) return { dip: near.dip, dipDir: perp[side], source: "outcrop" };
  return { dip: dipDefault(faultType(feature)), dipDir: perp[0], source: "default" };
}

const featureName = (f, fallback) => String(Object.entries(f?.attributes || {}).find(([k, v]) => /^name$/i.test(k) && v)?.[1] || Object.values(f?.attributes || {}).find((v) => FAULT_TEXT.test(String(v))) || fallback);

// the evidence items. In:
//   picks:     [{ x, y, z, dip, azimuth, type, id, hole_id, depth }]   placed on the traces by the caller, fault-like types only
//   intervals: [{ x0, y0, z0, x1, y1, z1, code, hole_id, from, to }]  a logged interval's top and bottom, placed by the caller
//   outcrop:   [{ x, y, z, dip, dipDir }]                             outcrop fault measurements (z: the ground, from the caller)
//   mapped:    [{ feature, layer }]                                   map line features read as faults (mappedFaultFeatures)
//   drawn:     [{ feature, layer }]                                   interpretation lines of type fault / shear (drawnFaultLines)
//   strings:   [{ id, unit, points: [{ x, y, z }], section }]         section strings of kind "fault"
//   ground(x, y) -> z, the terrain (NaN off it); dipFor(itemId) -> a dip the user set for a line with none
// -> [{ id, kind, name, points: [{x,y,z}], orientations: [{x,y,z,dip,azimuth}], holes, dipSource?, note? }]
export function evidenceItems({ picks = [], intervals = [], outcrop = [], mapped = [], drawn = [], strings = [], ground = () => NaN, userDip = {} } = {}) {
  const items = [];
  // picks: one item per structure type and name / ID, as the Structures tool groups them
  const byKey = new Map();
  for (const p of picks) if (finite(p.x, p.y, p.z, p.dip, p.azimuth)) { const k = `${p.type}|${p.id || ""}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
  for (const [k, rows] of byKey) {
    const [type, id] = k.split("|");
    items.push({ id: `pick:${k}`, kind: "pick", name: id ? `${type} — ${id}` : type, points: rows.map(({ x, y, z }) => ({ x, y, z })), orientations: rows.map(({ x, y, z, dip, azimuth }) => ({ x, y, z, dip, azimuth })), holes: new Set(rows.map((r) => r.hole_id)).size });
  }
  // logged intervals: one item per code; the top and the bottom of each interval are on the fault zone's walls
  const byCode = new Map();
  for (const r of intervals) if (isFaultCode(r.code)) { const k = String(r.code).trim().toUpperCase(); if (!byCode.has(k)) byCode.set(k, []); byCode.get(k).push(r); }
  for (const [code, rows] of byCode) {
    const points = [];
    for (const r of rows) { if (finite(r.x0, r.y0, r.z0)) points.push({ x: r.x0, y: r.y0, z: r.z0 }); if (finite(r.x1, r.y1, r.z1) && Math.hypot(r.x1 - r.x0, r.y1 - r.y0, r.z1 - r.z0) > 0.05) points.push({ x: r.x1, y: r.y1, z: r.z1 }); }
    if (points.length) items.push({ id: `logged:${code}`, kind: "logged", name: code, points, orientations: [], holes: new Set(rows.map((r) => r.hole_id)).size });
  }
  // outcrop fault measurements: one item
  const oc = outcrop.filter((m) => finite(m.x, m.y, m.z, m.dip, m.dipDir));
  if (oc.length) items.push({ id: "outcrop", kind: "outcrop", name: "Outcrop faults", points: oc.map(({ x, y, z }) => ({ x, y, z })), orientations: oc.map(({ x, y, z, dip, dipDir }) => ({ x, y, z, dip, azimuth: dipDir })), holes: 0 });
  // mapped fault lines: at the terrain, every 250 m, the map's dip (or the nearest outcrop fault's, or the type's) about every km
  mapped.forEach(({ feature, layer }, i) => {
    for (const [j, part] of (feature?.parts || (feature?.geometry ? [feature.geometry] : [])).entries()) {
      if (!part || part.length < 2) continue;
      const id = `mapped:${layer?.id ?? ""}:${i}:${j}`;
      const pts = thinLine(part).map(([x, y]) => ({ x, y, z: ground(x, y) })).filter((q) => finite(q.z));
      if (pts.length < 2) continue;
      const att = mappedFaultAttitude(feature, part, oc);
      const dip = Number.isFinite(userDip[id]) ? userDip[id] : att.dip;
      const nOri = Math.max(2, Math.min(8, Math.round(lineLength(part) / 1000)));
      const at = new Set(Array.from({ length: nOri }, (_, k) => Math.round((k * (pts.length - 1)) / (nOri - 1))));
      items.push({ id, kind: "mapped", name: featureName(feature, `Fault ${i + 1}`), points: pts, orientations: pts.filter((_, k) => at.has(k)).map((q) => ({ ...q, dip, azimuth: att.dipDir })), holes: 0, dipSource: Number.isFinite(userDip[id]) ? "user" : att.source });
    }
  });
  // drawn interpretation lines: at their level (the vertex z, #3972) or at the terrain; the line's dip and dip direction when it has them
  drawn.forEach(({ feature, layer }, i) => {
    const a = feature?.attributes || {};
    for (const [j, part] of (feature?.parts || []).entries()) {
      if (!part?.length) continue;
      const id = `drawn:${layer?.id ?? ""}:${i}:${j}`;
      const level = Number.isFinite(Number(a.level_rl)) ? Number(a.level_rl) : null;
      const verts = part.length >= 2 ? thinLine(part, 100) : part;
      const pts = verts.map((v) => ({ x: v[0], y: v[1], z: Number.isFinite(v[2]) ? v[2] : level != null ? level : ground(v[0], v[1]) })).filter((q) => finite(q.x, q.y, q.z));
      if (!pts.length) continue;
      const dip = Number.isFinite(userDip[id]) ? userDip[id] : Number(a.dip), dd = Number(a.dip_dir);
      const orientations = Number.isFinite(dip) && Number.isFinite(dd) ? [pts[0], pts[pts.length - 1]].filter((q, k, arr) => k === 0 || q !== arr[0]).map((q) => ({ ...q, dip, azimuth: dd })) : [];
      items.push({ id, kind: "drawn", name: String(a.name || `Line ${i + 1}`), points: pts, orientations, holes: 0, level });
    }
  });
  // fault strings on sections: their points, in 3D
  for (const s of strings) {
    const pts = (s.points || []).filter((q) => finite(q.x, q.y, q.z));
    if (pts.length) items.push({ id: `string:${s.section ?? ""}:${s.id}`, kind: "string", name: String(s.unit || s.id), points: pts.map(({ x, y, z }) => ({ x, y, z })), orientations: [], holes: 0 });
  }
  return items;
}

// a fault from its items: the points and orientations of the solve, an orientation from a fitted plane when no item has one (or from the
// dip the user set), and what to say. -> { ok, points, orientations, plane, guess, why?, said: [{ key, vars }] }
export function faultSpec(items, { dip = null, dipDir = null } = {}) {
  const points = items.flatMap((it) => it.points || []);
  let orientations = items.flatMap((it) => it.orientations || []);
  const plane = fitPlane(points);
  const said = [];
  if (!points.length) return { ok: false, points, orientations, plane, guess: true, why: "no-points", said };
  if (!orientations.length) {
    if (Number.isFinite(dip) && Number.isFinite(dipDir)) {
      const c = plane.centroid || points[0];
      orientations = [{ ...c, dip, azimuth: dipDir }];
      said.push({ key: "user-dip", vars: { dip, dipDir } });
    } else if (!plane.flat) {
      orientations = [{ ...plane.centroid, dip: plane.dip, azimuth: plane.dipDir }];
      said.push({ key: "fitted", vars: { dip: Math.round(plane.dip), dipDir: Math.round(plane.dipDir), n: points.length } });
    } else return { ok: false, points, orientations, plane, guess: true, why: "no-orientation", said };
  }
  const kinds = new Set(items.map((it) => it.kind)), holes = items.reduce((n, it) => n + (it.holes || 0), 0);
  const guess = points.length < GUESS_POINTS || (kinds.size === 1 && (kinds.has("pick") || kinds.has("logged")) && holes < 2);
  if (guess) said.push({ key: "guess", vars: { n: points.length } });
  return { ok: true, points, orientations, plane, guess, said };
}

// TASKS.csv #4006 — "a finite fault": the ellipse in the fault's plane around its evidence, plus a margin. -> { c, u, v, a, b } (u along
// strike, v down dip, semi-axes a, b); inEllipse(e, p) is true for a point whose projection on the plane falls inside it
export function faultEllipse(points, plane, marginM = 200) {
  if (!plane?.normal || !points?.length) return null;
  const n = plane.normal, c = plane.centroid;
  let u = [-n[1], n[0], 0]; const ul = Math.hypot(u[0], u[1]);
  u = ul > 1e-9 ? [u[0] / ul, u[1] / ul, 0] : [1, 0, 0]; // horizontal, along strike (a flat fault: east)
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  let a = 0, b = 0;
  for (const p of points) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; a = Math.max(a, Math.abs(d[0] * u[0] + d[1] * u[1] + d[2] * u[2])); b = Math.max(b, Math.abs(d[0] * v[0] + d[1] * v[1] + d[2] * v[2])); }
  // down dip it reaches at least half its length along strike (a fault's tip line is roughly an ellipse about twice as long as it is
  // deep): evidence from a map trace alone spans almost nothing down dip, and without this the fault would stop a margin below the ground
  const A = a + marginM;
  return { c, u, v, a: A, b: Math.max(b + marginM, A / 2) };
}
export function inEllipse(e, p) {
  const d = [p.x - e.c.x, p.y - e.c.y, p.z - e.c.z];
  const s = (d[0] * e.u[0] + d[1] * e.u[1] + d[2] * e.u[2]) / e.a, t = (d[0] * e.v[0] + d[1] * e.v[1] + d[2] * e.v[2]) / e.b;
  return s * s + t * t <= 1;
}
// keeps the triangles of a mesh (flat positions [x,y,z,...] and indices) whose centre falls inside the ellipse; the vertices are kept as they
// are (unused ones are harmless). -> { indices, kept, dropped }
export function clipMeshToEllipse(positions, indices, e) {
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const p = { x: (positions[a] + positions[b] + positions[c]) / 3, y: (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3, z: (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3 };
    if (inEllipse(e, p)) out.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  return { indices: out, kept: out.length / 3, dropped: indices.length / 3 - out.length / 3 };
}
