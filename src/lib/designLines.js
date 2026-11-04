// TASKS.csv #1342 — design linework for drifts, tunnels, ramps and declines. A line is a start point and heading plus a list of
// segments, so changing one segment's grade or radius moves everything after it, as it would on the ground:
//   { type: "straight", length, azimuth (null = carry on), grade }
//   { type: "curve", radius, turn: "left" | "right", angle (degrees, may pass 360 for a spiral), grade }
// Azimuth: degrees clockwise from north. Grade: percent, rise over run, positive climbing in the direction of travel.
// A straight's length is what is driven, along the slope. A curve's radius is in plan, as a turning radius is, and its length follows.
// World E, N, Z throughout. Pure.
const RAD = Math.PI / 180;
export const norm360 = (a) => ((a % 360) + 360) % 360;
const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const MAX_STEP_DEG = 5; // a curve's chords: at most this much turn each, so a 10 m radius and a 100 m one both look round

// -> { vertices: [[x, y, z, segmentIndex]], segments: [{ index, type, start, end, azimuthIn, azimuthOut, run, length, grade, radius, turn, angle, dz }],
//      end: [x, y, z], azimuth, length, run, dz, minRadius, steepest }
export function computeLine(line) {
  let x = finite(line?.start?.x), y = finite(line?.start?.y), z = finite(line?.start?.z), az = norm360(finite(line?.azimuth));
  const vertices = [[x, y, z, -1]], segments = [];
  let length = 0, run = 0, minRadius = null, steepest = 0;
  (line?.segments || []).forEach((s, index) => {
    const g = finite(s.grade) / 100, slope = Math.sqrt(1 + g * g), start = [x, y, z], azimuthIn = az;
    let segRun = 0;
    if (s.type === "curve") {
      const R = Math.abs(finite(s.radius)), side = s.turn === "left" ? -1 : 1, angle = Math.abs(finite(s.angle));
      if (R > 0 && angle > 0) {
        segRun = R * angle * RAD;
        const steps = Math.max(1, Math.ceil(angle / MAX_STEP_DEG)), az0 = az * RAD;
        for (let k = 1; k <= steps; k++) {
          const t = (angle * k) / steps, phi = az0 + side * t * RAD;
          vertices.push([x + side * R * (Math.cos(az0) - Math.cos(phi)), y + side * R * (Math.sin(phi) - Math.sin(az0)), z + g * R * t * RAD, index]);
        }
        const last = vertices[vertices.length - 1];
        x = last[0]; y = last[1]; z = last[2];
        az = norm360(az + side * angle);
        minRadius = minRadius == null ? R : Math.min(minRadius, R);
      }
    } else {
      if (s.azimuth != null && s.azimuth !== "" && Number.isFinite(Number(s.azimuth))) az = norm360(Number(s.azimuth));
      segRun = Math.max(0, finite(s.length)) / slope;
      x += segRun * Math.sin(az * RAD); y += segRun * Math.cos(az * RAD); z += g * segRun;
      vertices.push([x, y, z, index]);
    }
    const segLength = segRun * slope;
    length += segLength; run += segRun;
    if (segRun > 0 && Math.abs(g) > Math.abs(steepest)) steepest = g;
    segments.push({ index, type: s.type === "curve" ? "curve" : "straight", start, end: [x, y, z], azimuthIn, azimuthOut: az, run: segRun, length: segLength, grade: finite(s.grade), radius: s.type === "curve" ? Math.abs(finite(s.radius)) : null, turn: s.type === "curve" ? s.turn : null, angle: s.type === "curve" ? Math.abs(finite(s.angle)) : null, dz: z - start[2] });
  });
  return { vertices, segments, end: [x, y, z], azimuth: az, length, run, dz: z - finite(line?.start?.z), minRadius, steepest: steepest * 100 };
}

// The way to reach a point in plan from where a line now stands: a curve of this radius off the current heading, then straight.
// The curve turns towards the point. -> { turn, angle, azimuth, run } or null when the point is inside the turning circle.
export function tangentTo(from, azimuth, radius, target) {
  const dx = target[0] - from[0], dy = target[1] - from[1], az = azimuth * RAD;
  const cross = Math.sin(az) * dy - Math.cos(az) * dx; // < 0: the point lies to the right of the heading
  const side = cross <= 0 ? 1 : -1, cx = from[0] + side * radius * Math.cos(az), cy = from[1] - side * radius * Math.sin(az);
  const vx = target[0] - cx, vy = target[1] - cy, d = Math.hypot(vx, vy);
  if (d < radius) return null;
  const toTarget = Math.atan2(vx, vy) / RAD, off = Math.acos(radius / d) / RAD; // bearings, as azimuth is
  const radial0 = azimuth - side * 90, radial1 = toTarget - side * off;
  const angle = side > 0 ? norm360(radial1 - radial0) : norm360(radial0 - radial1);
  return { turn: side > 0 ? "right" : "left", angle, azimuth: norm360(azimuth + side * angle), run: Math.sqrt(Math.max(0, d * d - radius * radius)) };
}

// What a click at this plan point adds to a line: a straight, or with a radius a tangent curve and a straight, all at this grade.
// -> { segments: [...], insideCircle: bool } (segments are empty when the point cannot be reached)
export function segmentsToPoint(line, target, { radius = 0, grade = 0 } = {}) {
  const c = computeLine(line), g = finite(grade), slope = Math.sqrt(1 + (g / 100) ** 2), R = Math.abs(finite(radius));
  const dx = target[0] - c.end[0], dy = target[1] - c.end[1], dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { segments: [], insideCircle: false };
  const hasHeading = c.segments.length > 0 || (line.azimuth != null && line.azimuth !== "");
  if (R > 0 && hasHeading) {
    const t = tangentTo(c.end, c.azimuth, R, target);
    if (!t) return { segments: [], insideCircle: true };
    const out = [];
    if (t.angle > 0.01) out.push({ type: "curve", radius: R, turn: t.turn, angle: +t.angle.toFixed(3), grade: g });
    if (t.run > 1e-3) out.push({ type: "straight", length: +(t.run * slope).toFixed(3), azimuth: null, grade: g });
    return { segments: out, insideCircle: false };
  }
  return { segments: [{ type: "straight", length: +(dist * slope).toFixed(3), azimuth: +norm360(Math.atan2(dx, dy) / RAD).toFixed(3), grade: g }], insideCircle: false };
}

// how much of a line stands above the ground (a portal does, a drift should not), in metres of plan run. groundAt(x, y) -> elevation or null
export function runAboveGround(vertices, groundAt) {
  let above = 0;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1], b = vertices[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, g = groundAt(mx, my);
    if (Number.isFinite(g) && (a[2] + b[2]) / 2 > g) above += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return above;
}

// a grade as miners also say it: -14.3 % is 1 in 7
export const gradeRatio = (g) => (Math.abs(g) >= 0.5 ? `1:${Math.round(100 / Math.abs(g) * 10) / 10}` : null);

// export rows, one per vertex, with the distance driven so far
// TASKS.csv #1365 — the distance driven to each vertex, along the arcs: a curve's vertices share its length evenly (they are equal
// steps of angle), where summing the 5° chords came out 2 m short of the driven length on a 6.7 km decline. c: computeLine()
export function vertexChainage(c) {
  const per = new Map();
  c.vertices.forEach((v) => { if (v[3] >= 0) per.set(v[3], (per.get(v[3]) || 0) + 1); });
  let chain = 0;
  return c.vertices.map((v) => (v[3] < 0 ? 0 : (chain += c.segments[v[3]].length / per.get(v[3]))));
}


// TASKS.csv #1364 — the closest the line comes back to itself: two points far apart along it (more than 3x their distance) but
// near in space, as the turns of a spiral ramp or a drift crossing another. Segment to segment, so a crossing between vertices
// counts. Passes farther than `within` metres are not looked for. Pieces whose boxes are farther apart than the best so far are
// skipped, and nothing is allocated in the loop: a 6.7 km spiral (2,300 vertices) takes tens of ms, not a second.
// -> { distance, at: [x, y, z] } or null
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// the closest points of segments p0-p1 and q0-q1 -> { dist, s, t, q: [x, y, z] (the point on the second) }
function segDist(p0, p1, q0, q1) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], a = ux * ux + uy * uy + uz * uz;
  const vx = q1[0] - q0[0], vy = q1[1] - q0[1], vz = q1[2] - q0[2], wx = p0[0] - q0[0], wy = p0[1] - q0[1], wz = p0[2] - q0[2];
  const b = ux * vx + uy * vy + uz * vz, cc = vx * vx + vy * vy + vz * vz, d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz, den = a * cc - b * b;
  let s = den > 1e-12 ? clamp01((b * e - cc * d) / den) : 0;
  const t = cc > 1e-12 ? clamp01((b * s + e) / cc) : 0;
  s = a > 1e-12 ? clamp01((b * t - d) / a) : 0;
  const qx = q0[0] + t * vx, qy = q0[1] + t * vy, qz = q0[2] + t * vz;
  return { dist: Math.hypot(p0[0] + s * ux - qx, p0[1] + s * uy - qy, p0[2] + s * uz - qz), s, t, q: [qx, qy, qz] };
}
const boxes = (v) => { const n = v.length - 1, lo = new Float64Array(n * 3), hi = new Float64Array(n * 3); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[i * 3 + k] = Math.min(v[i][k], v[i + 1][k]); hi[i * 3 + k] = Math.max(v[i][k], v[i + 1][k]); } return { lo, hi }; };
const boxGap = (A, i, B, j) => { let gap = 0; for (let k = 0; k < 3; k++) { const g = Math.max(B.lo[j * 3 + k] - A.hi[i * 3 + k], A.lo[i * 3 + k] - B.hi[j * 3 + k], 0); gap += g * g; } return gap; };
export function selfClearance(c, within = 100) {
  const v = c.vertices, ch = vertexChainage(c), n = v.length - 1;
  if (n < 3) return null;
  const bx = boxes(v);
  let bestD = within, at = null;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (boxGap(bx, i, bx, j) >= bestD * bestD) continue; // the distance between the two boxes: a lower bound on the pieces' distance
    const r = segDist(v[i], v[i + 1], v[j], v[j + 1]);
    if (r.dist >= bestD) continue;
    const along = ch[j] + r.t * (ch[j + 1] - ch[j]) - (ch[i] + r.s * (ch[i + 1] - ch[i]));
    if (r.dist * 3 < along) { bestD = r.dist; at = r.q; }
  }
  return at ? { distance: bestD, at } : null;
}

// TASKS.csv #1878 — the closest pass between this line and another polyline (another design line, a drillhole trace): the
// rock left between them. polylines: [{ name, vertices: [[x, y, z], ...] }]. -> { distance, at, name } for the nearest within `within`, or null
export function clearanceTo(c, polylines, within = 100) {
  const v = c.vertices, n = v.length - 1;
  if (n < 1) return null;
  const A = boxes(v);
  let bestD = within, at = null, name = null;
  for (const pl of polylines) {
    const w = pl.vertices, m = w.length - 1;
    if (m < 1) continue;
    const B = boxes(w);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      if (boxGap(A, i, B, j) >= bestD * bestD) continue;
      const r = segDist(v[i], v[i + 1], w[j], w[j + 1]);
      if (r.dist < bestD) { bestD = r.dist; at = r.q; name = pl.name; }
    }
  }
  return at ? { distance: bestD, at, name } : null;
}

// TASKS.csv #1878 / #1611 — a straight whose typed azimuth turns the line (more than 2 degrees off the heading it arrives on) is a
// sharp corner: undrivable at any radius. -> [{ segment (1-based), turn (degrees) }]
export function sharpCorners(c) {
  const out = [];
  c.segments.forEach((s, i) => {
    if (s.type !== "straight" || i === 0 && c.segments.length === 1) return;
    const prev = c.segments[i - 1];
    if (!prev) return;
    let turn = Math.abs(norm360(s.azimuthOut - prev.azimuthOut));
    if (turn > 180) turn = 360 - turn;
    if (turn > 2) out.push({ segment: i + 1, turn: +turn.toFixed(1) });
  });
  return out;
}

// TASKS.csv #1878 — DECLINE TO A TARGET: the segments that take the line from where it stands to `target` [x, y, z] at no more
// than `maxGrade` (percent, unsigned) with curves no tighter than `minRadius`. The plan route is a tangent curve off the heading
// then a straight (tangentTo); if that run cannot lose the elevation at the maximum grade, a spiral of whole turns at the minimum
// radius goes first (a full turn comes back to the same plan point and heading, one turn's worth lower), and the route then runs
// at the grade that lands exactly on the target. A line with no heading yet heads straight at the target.
// -> { segments, turns, grade, run, length, routeLength, insideCircle } (segments empty when the target cannot be reached);
// routeLength is the driven length after the spiral (#1895), length the whole addition
export function declineToTarget(line, target, { maxGrade, minRadius }) {
  const c = computeLine(line), g = Math.abs(finite(maxGrade)) / 100, R = Math.abs(finite(minRadius));
  const dz = target[2] - c.end[2];
  const hasHeading = c.segments.length > 0 || (line.azimuth != null && line.azimuth !== "");
  const dx = target[0] - c.end[0], dy = target[1] - c.end[1], dist = Math.hypot(dx, dy);
  // #1890 — the stored segments round to the millimetre, so a line that already reaches the target ends within a few mm of it
  if (dist < 0.05 && Math.abs(dz) < 0.05) return { segments: [], turns: 0, grade: 0, run: 0, length: 0, routeLength: 0, insideCircle: false };
  let route = null, azimuth = c.azimuth, turn = "right";
  if (hasHeading && R > 0) {
    const t = tangentTo(c.end, c.azimuth, R, target);
    if (!t) return { segments: [], turns: 0, grade: 0, run: 0, length: 0, insideCircle: true };
    route = { curve: t.angle > 0.01 ? { radius: R, turn: t.turn, angle: +t.angle.toFixed(3) } : null, run: t.run + (t.angle > 0.01 ? R * t.angle * RAD : 0), straight: t.run };
    turn = t.turn;
  } else {
    route = { curve: null, run: dist, straight: dist, azimuth: +norm360(Math.atan2(dx, dy) / RAD).toFixed(3) };
    azimuth = route.azimuth;
  }
  if (!(g > 0) && Math.abs(dz) > 1e-6) return { segments: [], turns: 0, grade: 0, run: route.run, length: 0, insideCircle: false, needsGrade: true };
  // whole turns of a spiral at the minimum radius to lose what the route cannot
  let turns = 0, spiralDz = 0;
  const canLose = route.run * g, need = Math.abs(dz);
  if (need > canLose + 1e-9) {
    if (!(R > 0)) return { segments: [], turns: 0, grade: 0, run: route.run, length: 0, insideCircle: false, needsRadius: true };
    const perTurn = 2 * Math.PI * R * g;
    turns = Math.ceil((need - canLose) / perTurn);
    spiralDz = Math.sign(dz) * turns * perTurn;
  }
  const rest = dz - spiralDz, grade = route.run > 1e-9 ? +((rest / route.run) * 100).toFixed(2) : 0, slope = Math.sqrt(1 + (grade / 100) ** 2); // 2 decimals: #1895
  const segments = [];
  if (turns > 0) segments.push({ type: "curve", radius: R, turn, angle: 360 * turns, grade: +(Math.sign(dz) * g * 100).toFixed(2) });
  if (route.curve) segments.push({ type: "curve", ...route.curve, grade });
  if (route.straight > 1e-3) segments.push({ type: "straight", length: +(route.straight * slope).toFixed(3), azimuth: route.azimuth ?? null, grade });
  const segLen = (s) => (s.type === "curve" ? s.radius * s.angle * RAD * Math.sqrt(1 + (s.grade / 100) ** 2) : s.length);
  const length = segments.reduce((a, s) => a + segLen(s), 0);
  const routeLength = length - (turns > 0 ? segLen(segments[0]) : 0);
  return { segments, turns, grade, run: route.run, length, routeLength, insideCircle: false, azimuth };
}

// TASKS.csv #1878 — a development PROFILE swept along the line: width x height, a flat back or an arched one (a half circle of the
// width on top of the walls). area in m2; profileMesh -> { positions, indices } (world E, N, Z) with closed ends, wound outward.
export function profileArea({ width, height, shape = "flat" }) {
  const w = Math.max(0, finite(width)), h = Math.max(0, finite(height));
  if (shape === "arched" && h > w / 2) return w * (h - w / 2) + (Math.PI * (w / 2) ** 2) / 2;
  return w * h;
}
export function profileMesh(vertices, { width, height, shape = "flat", arcSteps = 8 }) {
  const w = Math.max(0.01, finite(width)), h = Math.max(0.01, finite(height));
  const pts = vertices.filter((v) => v.length >= 3 && v.every((x) => Number.isFinite(x)));
  if (pts.length < 2) return null;
  // the cross-section in (across, up) from the floor's centre: counter-clockwise seen from behind (looking along the line)
  const sec = [[-w / 2, 0], [w / 2, 0]];
  if (shape === "arched" && h > w / 2) {
    const wall = h - w / 2;
    sec.push([w / 2, wall]);
    for (let k = 1; k < arcSteps; k++) { const a = (k / arcSteps) * Math.PI; sec.push([(w / 2) * Math.cos(a), wall + (w / 2) * Math.sin(a)]); }
    sec.push([-w / 2, wall]);
  } else sec.push([w / 2, h], [-w / 2, h]);
  const m = sec.length, pos = [], idx = [];
  // each vertex's frame: the across vector in plan, to the right of travel; at a corner the mitre direction, stretched by
  // 1 / cos(half the turn) so the walls stay parallel through the corner (an unstretched mitre pinches the tube)
  const rightOf = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dy / L, -dx / L]; };
  pts.forEach((p, i) => {
    const rIn = i > 0 ? rightOf(pts[i - 1], p) : null, rOut = i < pts.length - 1 ? rightOf(p, pts[i + 1]) : null;
    let right;
    if (rIn && rOut) {
      const mx = rIn[0] + rOut[0], my = rIn[1] + rOut[1], L = Math.hypot(mx, my);
      if (L < 1e-9) right = rIn; // a hairpin: no mitre to speak of
      else { const m0 = [mx / L, my / L], cos = Math.max(1 / 3, m0[0] * rIn[0] + m0[1] * rIn[1]); right = [m0[0] / cos, m0[1] / cos]; }
    } else right = rIn || rOut;
    sec.forEach(([u, v]) => pos.push(p[0] + right[0] * u, p[1] + right[1] * u, p[2] + v));
  });
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < m; k++) {
    const a = i * m + k, b = i * m + ((k + 1) % m), c = (i + 1) * m + k, d = (i + 1) * m + ((k + 1) % m);
    idx.push(a, c, b, b, c, d);
  }
  // the end caps: a fan from the first section point. The section is counter-clockwise seen from behind, so its own winding faces
  // backwards: the start cap keeps it (outward = backwards), the end cap is reversed
  for (let k = 1; k < m - 1; k++) { idx.push(0, k, k + 1); const o = (pts.length - 1) * m; idx.push(o, o + k + 1, o + k); }
  const positions = Float64Array.from(pos), indices = Uint32Array.from(idx);
  // outward: the signed volume must be positive
  let v6 = 0;
  const rx = positions[0], ry = positions[1], rz = positions[2];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a] - rx, ay = positions[a + 1] - ry, az = positions[a + 2] - rz, bx = positions[b] - rx, by = positions[b + 1] - ry, bz = positions[b + 2] - rz, cx = positions[c] - rx, cy = positions[c + 1] - ry, cz = positions[c + 2] - rz;
    v6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (v6 < 0) for (let t = 0; t < indices.length; t += 3) { const k = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = k; }
  return { positions, indices, volume: Math.abs(v6) / 6 };
}

// TASKS.csv #1878 — the development table: metres by line, split into level development (within `flatGrade` percent of flat) and
// ramp / decline, with the excavation at each line's profile and a density. -> rows for the pane and the CSV
export function developmentRows(lines, { flatGrade = 2, density = null } = {}) {
  return lines.map((l) => {
    const c = computeLine(l);
    let flat = 0, ramp = 0;
    c.segments.forEach((s) => { if (Math.abs(s.grade) <= flatGrade) flat += s.length; else ramp += s.length; });
    const area = l.profile?.width > 0 && l.profile?.height > 0 ? profileArea(l.profile) : null;
    const volume = area != null ? area * c.length : null;
    return { line: l.name, length_m: +c.length.toFixed(1), level_m: +flat.toFixed(1), ramp_m: +ramp.toFixed(1), steepest_pct: +c.steepest.toFixed(2), profile: area != null ? `${l.profile.width} x ${l.profile.height} ${l.profile.shape || "flat"}` : "", area_m2: area == null ? "" : +area.toFixed(2), volume_m3: volume == null ? "" : Math.round(volume), tonnes: volume != null && density > 0 ? Math.round(volume * density) : "" };
  });
}

export function designLineRows(lines) {
  const out = [];
  lines.forEach((line) => {
    const c = computeLine(line), chain = vertexChainage(c);
    c.vertices.forEach((v, i) => {
      const seg = c.segments[v[3]];
      out.push({ line: line.name, vertex: i, segment: v[3] < 0 ? "" : v[3] + 1, x: +v[0].toFixed(3), y: +v[1].toFixed(3), z: +v[2].toFixed(3), chainage_m: +chain[i].toFixed(2), type: seg?.type || "start", grade_pct: seg ? seg.grade : "", radius_m: seg?.radius ?? "" });
    });
  });
  return out;
}
export const designLineFeatures = (lines) => lines.map((line) => ({ attributes: { name: line.name, color: line.color }, geometry: computeLine(line).vertices.map((v) => [v[0], v[1], v[2]]) })).filter((f) => f.geometry.length > 1);
