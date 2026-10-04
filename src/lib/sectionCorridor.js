// TASKS.csv #499 — which parts of a drill hole are actually IN a cross-section's corridor. The section used to
// take a hole when any vertex came within the corridor and then draw the whole trace, and every interval,
// assay and structure on it, as if on the section: a hole collared 200 m off a ±25 m E-W section and drilled
// toward it was drawn over its full 400 m, with intercepts from 200 m away beside the ones in the section and
// nothing saying so. Here each trace is split into the depth runs inside the corridor (same distance test as
// the section's hole selection: distance to the section SEGMENT), and the hole's offset from the line is
// reported. Pure; tested in test/core.test.mjs.

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Signed perpendicular offset from the section line a -> b (+ = left of the line looking from a to b).
export function signedOffset(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return ((x - a.x) * -dy + (y - a.y) * dx) / len;
}

// trace: [{ md, x, y }] (world x / y), in depth order. Returns the measured-depth runs inside the corridor
// (crossings interpolated between vertices) and the signed offset range of the in-corridor part.
export function corridorRuns(trace, a, b, corridor) {
  const runs = [];
  let minOff = Infinity, maxOff = -Infinity;
  const d = trace.map((p) => distToSegment(p.x, p.y, a.x, a.y, b.x, b.y));
  let start = d[0] <= corridor ? trace[0].md : null;
  for (let i = 0; i < trace.length; i++) {
    const p = trace[i];
    if (d[i] <= corridor) { const o = signedOffset(p.x, p.y, a, b); minOff = Math.min(minOff, o); maxOff = Math.max(maxOff, o); }
    if (i === 0) continue;
    const q = trace[i - 1], inQ = d[i - 1] <= corridor, inP = d[i] <= corridor;
    if (inQ !== inP) {
      const t = (corridor - d[i - 1]) / (d[i] - d[i - 1]); // where the distance crosses the corridor edge
      const md = q.md + t * (p.md - q.md);
      if (inP) start = md; else { runs.push([start, md]); start = null; }
    }
  }
  if (start != null) runs.push([start, trace[trace.length - 1].md]);
  return { runs, minOffset: Number.isFinite(minOff) ? minOff : null, maxOffset: Number.isFinite(maxOff) ? maxOff : null };
}

export const mdInRuns = (md, runs) => (runs || []).some(([a, b]) => md >= a - 1e-6 && md <= b + 1e-6);
