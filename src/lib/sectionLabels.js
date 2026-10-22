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

export function placeLabels(items, { fontSize = 9, bounds = null, fixed = {}, gap = 2, maxTiers = 12 } = {}) {
  const h = fontSize + 2, base = 6, out = [], placed = [];
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
    for (let tier = 0; tier <= maxTiers && !(best && best.cost <= tier * (h + gap)); tier++) {
      for (const s of [0, -1, 1, -2, 2, -3, 3]) {
        const shift = s * (w * 0.55 + gap);
        const cand = { x: clampX(n.x + shift, w), y: n.y + it.dir * tier * (h + gap), w, h };
        if (placed.some((p) => overlaps(cand, p, gap))) continue;
        const cost = tier * (h + gap) + Math.abs(cand.x - n.x) * 0.5;
        if (!best || cost < best.cost) best = { ...cand, cost };
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
