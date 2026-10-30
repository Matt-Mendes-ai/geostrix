// TASKS.csv #823 — drillhole labels on a cross-section that do not sit on top of each other. Matt (a Layout page with a
// section of holes fanned from one pad): "all drill hole labels are clumped together. I also wanna have the ability of
// have the drill hole label at the end of the hole if I choose so. Also add a call out to them and move them around".
//
// placeLabels(items, { fontSize, bounds, fixed }) -> [{ key, x, y, w, h, ax, ay, dir, moved, leader }]
//   items: [{ key, text, ax, ay, dir }] - the anchor (collar or end of hole) in SVG units; dir -1 puts the label above
//   it (collars), +1 below (ends of holes). Greedy, left to right: each label takes the cheapest free spot among tiers
//   (stacked away from the anchor) x sideways shifts, cost = tier height + half the shift, so a pad of holes collared
//   together fans its labels out into a small stair instead of one unreadable blot. bounds: [x0, x1] the labels stay
//   inside. fixed: { key: { dx, dy } } labels the geologist dragged (offset from the anchor, SVG units): placed there
//   first, and the automatic ones avoid them. A label away from its natural spot gets a leader line (call-out).
// Text width is estimated (0.58 em per character, Inter-like fonts at 9-10 px): it only needs to keep boxes apart.
// Pure: no DOM, no React.

export const labelWidth = (text, fontSize) => Math.ceil(String(text).length * fontSize * 0.58) + 4;

const overlaps = (a, b, gap) => a.x - a.w / 2 < b.x + b.w / 2 + gap && b.x - b.w / 2 < a.x + a.w / 2 + gap && a.y - a.h < b.y + gap && b.y - b.h < a.y + gap; // x: centre, y: baseline

export function placeLabels(items, { fontSize = 9, bounds = null, yBounds = null, fixed = {}, gap = 2, maxTiers = 12, avoid = [] } = {}) {
  // avoid: boxes to keep clear that are not labels of ours (#1144: the elevation numbers in the left margin)
  const h = fontSize + 2, base = 6, out = [], placed = [...avoid];
  const clampX = (x, w) => (bounds ? Math.min(bounds[1] - w / 2, Math.max(bounds[0] + w / 2, x)) : x);
  const natural = (it, w) => ({ x: clampX(it.ax, w), y: it.dir < 0 ? it.ay - base : it.ay + base + fontSize });
  // the spot it would take with no bounds: a label pushed in from an anchor near or past the edge is called out too
  const ideal = (it) => ({ x: it.ax, y: it.dir < 0 ? it.ay - base : it.ay + base + fontSize });
  // dragged labels first: where the geologist put them
  for (const it of items) {
    const f = fixed[it.key];
    if (!f) continue;
    const w = labelWidth(it.text, fontSize), x = it.ax + f.dx, y = it.ay + f.dy;
    const box = { key: it.key, text: it.text, x, y, w, h, ax: it.ax, ay: it.ay, dir: it.dir, moved: true };
    const n = ideal(it);
    box.leader = Math.hypot(x - n.x, y - n.y) > 3;
    placed.push(box); out.push(box);
  }
  const auto = items.filter((it) => !fixed[it.key]).sort((a, b) => a.ax - b.ax || a.ay - b.ay);
  for (const it of auto) {
    const w = labelWidth(it.text, fontSize), n = natural(it, w);
    let best = null;
    // #1144 — away from the anchor first; only with nothing free that way, the other side of it (a collar right under the
    // title band, a hole ending on the distance axis)
    const start = { x: n.x, y: it.ay + (-it.dir > 0 ? base + fontSize : -base) };
    for (const [from, dir] of [[n, it.dir], [start, -it.dir]]) {
      if (best) break;
      for (let tier = 0; tier <= maxTiers && !(best && best.cost <= tier * (h + gap)); tier++) {
        for (const s of [0, -1, 1, -2, 2, -3, 3]) {
          const shift = s * (w * 0.55 + gap);
          const cand = { x: clampX(from.x + shift, w), y: from.y + dir * tier * (h + gap), w, h };
          if (yBounds && (cand.y - h < yBounds[0] || cand.y > yBounds[1])) continue; // #1144 — never off the drawing
          if (placed.some((p) => overlaps(cand, p, gap))) continue;
          const cost = tier * (h + gap) + Math.abs(cand.x - from.x) * 0.5;
          if (!best || cost < best.cost) best = { ...cand, cost };
        }
      }
    }
    if (!best) best = { ...n, w, h, cost: 0 }; // nowhere free within reach: its natural spot (overlapping) rather than far away
    const box = { key: it.key, text: it.text, x: best.x, y: best.y, w, h, ax: it.ax, ay: it.ay, dir: it.dir, moved: false };
    const id = ideal(it);
    box.leader = Math.hypot(box.x - id.x, box.y - id.y) > 3;
    placed.push(box); out.push(box);
  }
  return out;
}

// where a leader line meets its label: the middle of the box's edge that faces the anchor
export function leaderEnd(b) {
  const top = b.y - b.h + 1, bottom = b.y + 2;
  if (b.ay <= top) return [b.x, top];
  if (b.ay >= bottom) return [b.x, bottom];
  return [b.ax < b.x ? b.x - b.w / 2 : b.x + b.w / 2, (top + bottom) / 2];
}

// TASKS.csv #1134 — Matt (a section screenshot): "some text still on top of others and behind the drill holes". Depth
// ticks, end-of-hole depths, offsets ("+49…+50 m") and planned-hole labels were drawn wherever they fell, some before
// the interval ribbons (so under them) and none checking the others. They now go through one pass, drawn last:
// specs [{ key, text, size, prio, cands: [{ x, y, anchor }] }] (x / baseline y in SVG units, anchor start / middle /
// end), highest prio first, each at its first candidate spot that clears everything already placed (obstacles: the
// hole-name boxes from placeLabels, centre-x / baseline-y form). A label with prio <= 1 (a depth number) is left out
// when no spot is free. -> [{ key, x, y, anchor, ... }]
// TASKS.csv #1144 — the others used to take their first spot anyway, on top of whatever was there: at print size "planned
// EOH 500 m" covered PS-26-23's name. They now search outward from their first spot for a clear one, nearest first, and
// come back with `leaderFrom` (that first spot) so the drawing can tie a displaced label to its hole. Only with nowhere
// free in reach do they overlap. bounds: [x0, x1] the search stays inside.
const RINGS = 10;
export function resolveLabels(specs, obstacles = [], { gap = 1.5, bounds = null, yBounds = null } = {}) {
  const placed = obstacles.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h, y1: b.y + 2 }));
  const boxOf = (c, text, size) => {
    const w = labelWidth(text, size), x0 = c.anchor === "end" ? c.x - w : c.anchor === "middle" ? c.x - w / 2 : c.x;
    return { x0, x1: x0 + w, y0: c.y - size, y1: c.y + 2 };
  };
  const hit = (a) => placed.some((b) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap);
  const out = [];
  specs.map((s, i) => ({ s, i })).sort((a, b) => b.s.prio - a.s.prio || a.i - b.i).forEach(({ s }) => {
    let pick = null;
    for (const c of s.cands) { const box = boxOf(c, s.text, s.size); if (!hit(box)) { pick = { c, box }; break; } }
    if (!pick && s.prio <= 1) return;
    let leaderFrom = null;
    if (!pick) {
      const c0 = s.cands[0], w = labelWidth(s.text, s.size), inside = (b) => (!bounds || (b.x0 >= bounds[0] && b.x1 <= bounds[1])) && (!yBounds || (b.y0 >= yBounds[0] && b.y1 <= yBounds[1]));
      search: for (let r = 1; r <= RINGS; r++) for (const dy of [r, -r]) for (const dx of [0, -0.6, 0.6, -1.2, 1.2]) {
        const c = { ...c0, x: c0.x + dx * w, y: c0.y + dy * (s.size + 3) }, box = boxOf(c, s.text, s.size);
        if (inside(box) && !hit(box)) { pick = { c, box }; leaderFrom = { x: c0.x, y: c0.y - s.size / 2 }; break search; }
      }
      if (!pick) pick = { c: c0, box: boxOf(c0, s.text, s.size) };
    }
    placed.push(pick.box);
    out.push({ ...s, x: pick.c.x, y: pick.c.y, anchor: pick.c.anchor || "start", ...(leaderFrom ? { leaderFrom } : {}) });
  });
  return out;
}
