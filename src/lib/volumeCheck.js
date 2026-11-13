// TASKS.csv #2530 (review #2486, WA lithium) — the same code in the same 30 holes gave 160.8 Mm³, 4.85 Mm³, 0.53 Mm³, 0.30 Mm³ or nothing,
// depending on the tool, each printed to the cubic metre (528,073 m³). An indicator envelope's volume moves by tens of percent with its cell
// and search, so it is given to two significant figures, beside a check anyone can redo by hand: the logged length of the code times the
// area each hole stands for (the hole spacing squared). The reviewer's hand figure for pegmatite there was 0.48-0.54 Mm³.

// 528,073 -> 530,000; 4,851,143 -> 4,900,000; 0 / bad -> 0
export function roundVolume(m3, sig = 2) {
  const v = Number(m3);
  if (!(v > 0) || !Number.isFinite(v)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - (sig - 1));
  return Math.round(v / p) * p;
}

// runs [{ hole_id, from, to }] (the code's merged logged runs), spacingM: the median hole spacing -> { metres, holes, spacingM, m3 } | null
// area (#2919): areaPerHole's result, used in place of the spacing squared when given
export function loggedVolumeCheck(runs, spacingM, area = null) {
  const s = Number(spacingM);
  if (!(s > 0 || area?.m2 > 0) || !runs?.length) return null;
  let metres = 0;
  const holes = new Set();
  for (const r of runs) { const d = Number(r.to) - Number(r.from); if (d > 0) { metres += d; holes.add(r.hole_id); } }
  if (!(metres > 0)) return null;
  return { metres, holes: holes.size, spacingM: s, ...(area?.m2 > 0 ? { areaM2: area.m2, hullHoles: area.holes } : {}), m3: metres * (area?.m2 > 0 ? area.m2 : s * s) };
}

// TASKS.csv #2919 (review #2876, WA iron) — the hand check used the median nearest-hole distance squared as each hole's area: 22 m gave 484 m²
// a hole where the 225 holes of the block cover 256,509 m² in their hull (1,140 m² a hole), so the check was half the reviewer's (0.35 against
// 0.73-0.84 Mm³). The area each hole stands for: the hull of the holes that log the unit, divided by every hole inside it (logged or not).
// logged: [{ x, y }] of the holes that log it; all: [{ x, y }] of the holes the run uses -> { m2, hullM2, holes } | null (fewer than 3)
export function areaPerHole(logged, all) {
  const pts = (logged || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (pts.length < 3) return null;
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const p of s) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 3) return null;
  let a2 = 0;
  for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; a2 += p.x * q.y - q.x * p.y; }
  const hullM2 = Math.abs(a2) / 2;
  if (!(hullM2 > 0)) return null;
  const inside = (p) => hull.every((h, i) => cross(h, hull[(i + 1) % hull.length], p) >= -1e-6);
  const holes = Math.max(pts.length, (all || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && inside(p)).length);
  return { m2: hullM2 / holes, hullM2, holes };
}
