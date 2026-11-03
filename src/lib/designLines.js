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
export function designLineRows(lines) {
  const out = [];
  lines.forEach((line) => {
    const c = computeLine(line);
    let chain = 0;
    c.vertices.forEach((v, i) => {
      if (i > 0) { const p = c.vertices[i - 1]; chain += Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]); }
      const seg = c.segments[v[3]];
      out.push({ line: line.name, vertex: i, segment: v[3] < 0 ? "" : v[3] + 1, x: +v[0].toFixed(3), y: +v[1].toFixed(3), z: +v[2].toFixed(3), chainage_m: +chain.toFixed(2), type: seg?.type || "start", grade_pct: seg ? seg.grade : "", radius_m: seg?.radius ?? "" });
    });
  });
  return out;
}
export const designLineFeatures = (lines) => lines.map((line) => ({ attributes: { name: line.name }, geometry: computeLine(line).vertices.map((v) => [v[0], v[1], v[2]]) })).filter((f) => f.geometry.length > 1);
