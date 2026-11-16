// TASKS.csv #3820 (Scottie Gold review, 84 inclined holes in fans from 57 pads) — 'Typical spacing' was measured between COLLAR SITES: 63 m, and 120 m for the 36
// 'Contact' holes, against 32-34 m between the holes where they cut the gold. Undrilled zones' default (half the spacing) called 80 % of a shell covered where half the
// true spacing gives 40 %; the Evidence overlay's reach (twice the site spacing) and the Planned holes' minimum spacing took the same number. The spacing where the holes
// are: the median, over points every few metres down every hole's trace, of the distance in 3D to the nearest point of ANOTHER hole (lib/sampleSpacing.js's rule, which
// the grade shell's search already uses for the samples, #3580). ids: a subset of holes asks, but is measured against EVERY hole (the Contact holes' 120 m between sites
// could not see the holes of other zones drilled between them).
// Pure. traces: Map hole_id -> [{ x, y, z }] (any one frame, metres) or [{ hole_id, pts }] -> { medianM, q3M, samples } | null
import { sampleSpacing } from "./sampleSpacing.js";

const MAX_POINTS = 60000;
export const SKIP_COLLAR_M = 20; // the fan's first metres: holes from one pad start together (0 m apart), which says nothing of how they cut the ground
export function traceSpacing(traces, { stepM = 5, ids = null, skipM = SKIP_COLLAR_M } = {}) {
  const entries = traces instanceof Map ? [...traces] : (traces || []).map((t) => [t.hole_id, t.pts]);
  const want = ids ? new Set(ids) : null;
  const pts = [];
  let total = 0;
  for (const [, p] of entries) total += (p?.length || 0);
  const step = Math.max(stepM, total > 0 ? (stepM * total) / MAX_POINTS : stepM); // a huge project thins its points, not its holes
  for (const [id, p] of entries) {
    if (!p || p.length < 2) continue;
    let carry = 0, md = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (!(len > 0)) continue;
      let at = step - carry;
      while (at <= len) { if (md + at > skipM) { const f = at / len; pts.push({ hole_id: id, x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), z: a.z + f * (b.z - a.z) }); } at += step; }
      carry = len - (at - step); md += len;
    }
  }
  return sampleSpacing(pts, { queryHoles: want });
}

// the spacing a coverage distance or a reach should start from: the smaller of the collar sites' and the holes' own (fans from shared pads make the holes closer
// together at depth than their pads are); null when neither is known
export const effectiveSpacing = (siteM, holeM) => { const v = [siteM, holeM].filter((x) => Number.isFinite(x) && x > 0); return v.length ? v.reduce((a, x) => (x < a ? x : a), Infinity) : null; };
