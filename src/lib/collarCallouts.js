// TASKS.csv #3397 (Matt: "draw call outs where more than 1 drill hole is located") — his Orion plan showed 7 holes as 4 dots and 4 labels:
// holes drilled from one pad sit a few metres apart, their ids overprinted and the declutter (collarMapStyle.declutterLabels) dropped all
// but the first. Holes that start at one spot (within PAD_M metres, or closer on screen than two labels can be told apart) are one pad:
// one ring round them and a callout, a leader line to a small box listing each id with its colour-by swatch, put where it clears the
// other markers, labels and callouts. A single hole keeps its plain label. Pure (screen pixels in, rectangles out) except drawCallouts,
// which takes a canvas 2D context: the Maps plan uses it, and the Layout drill plan can use the grouping and the placement.

export const PAD_M = 5; // holes this close in plan are one pad, at any scale where the pad stays small on screen (PAD_MAX_PX)
export const SEP_PX = 12; // closer than this on screen, two labels cannot be told apart: one callout, whatever the distance on the ground
export const PAD_MAX_PX = 30; // holes drawn farther apart than this have room for their own labels (zoomed in on a pad: each its id)
export const MAX_LISTED = 8; // a callout lists this many ids; more get '+n more'
export const MAX_CALLOUTS = 200; // past this many pads in view (a dense grid at Fit), pads get a short label 'id +n' instead

// a grid hash of rectangles { x0, y0, x1, y1 }
export class RectIndex {
  constructor(cell = 48) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 131071 + j; }
  add(r) {
    const c = this.cell;
    for (let i = Math.floor(r.x0 / c); i <= Math.floor(r.x1 / c); i++) for (let j = Math.floor(r.y0 / c); j <= Math.floor(r.y1 / c); j++) {
      const k = this.key(i, j), a = this.map.get(k);
      if (a) a.push(r); else this.map.set(k, [r]);
    }
  }
  hits(r) {
    const c = this.cell;
    for (let i = Math.floor(r.x0 / c); i <= Math.floor(r.x1 / c); i++) for (let j = Math.floor(r.y0 / c); j <= Math.floor(r.y1 / c); j++) {
      for (const q of this.map.get(this.key(i, j)) || []) if (q.x0 < r.x1 && r.x0 < q.x1 && q.y0 < r.y1 && r.y0 < q.y1) return true;
    }
    return false;
  }
}

// world: [{ x, y }] metres; screen: [{ x, y }] pixels (NaN: off the view, left out); mPerPx: the scale.
// -> pads in input order of their first hole: [{ members: [index ...], x, y (mean pixel), r (pixels from the mean to the farthest hole) }]
// A pad gathers the holes near its first hole (not a chain: a 25 m grid at Fit is not one pad).
export function collarPads(world, screen, mPerPx, { padM = PAD_M, sepPx = SEP_PX, maxPx = PAD_MAX_PX } = {}) {
  const tolPx = Math.max(sepPx, Math.min(maxPx, mPerPx > 0 ? padM / mPerPx : 0));
  const cell = Math.max(1, tolPx), grid = new Map(), key = (i, j) => i * 131071 + j;
  const n = screen.length, used = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = screen[i];
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) { used[i] = 1; continue; }
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell)), a = grid.get(k);
    if (a) a.push(i); else grid.set(k, [i]);
  }
  const near = (i, j) => {
    const a = screen[i], b = screen[j], dPx = Math.hypot(a.x - b.x, a.y - b.y);
    if (dPx < sepPx) return true;
    if (dPx > maxPx) return false;
    const u = world[i], v = world[j];
    return Number.isFinite(u?.x) && Number.isFinite(v?.x) && Math.hypot(u.x - v.x, u.y - v.y) <= padM;
  };
  const pads = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const members = [i], p = screen[i], ci = Math.floor(p.x / cell), cj = Math.floor(p.y / cell);
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) {
      for (const j of grid.get(key(a, b)) || []) if (!used[j] && near(i, j)) { used[j] = 1; members.push(j); }
    }
    if (members.length > 1) members.sort((a, b) => a - b);
    let sx = 0, sy = 0;
    for (const m of members) { sx += screen[m].x; sy += screen[m].y; }
    const x = sx / members.length, y = sy / members.length;
    let r = 0;
    for (const m of members) r = Math.max(r, Math.hypot(screen[m].x - x, screen[m].y - y));
    pads.push({ members, x, y, r });
  }
  return pads;
}

// where a callout's box goes: tried round the pad (right first, as a plain label reads), at two leader lengths
const DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];
// callouts: [{ x, y, r, w, h }] (the pad's ring and its box size); index: a RectIndex of what is drawn already (markers, other labels);
// view: { w, h }; avoid: a RectIndex the boxes also clear but labels may cross (the markers). -> per callout { box: { x0, y0, x1, y1 }, from: { x, y } (on the ring), to: { x, y } (on the box) } or null (no room).
// Each placed box goes into the index, so later callouts and labels clear it.
export function placeCallouts(callouts, index, view, { leaders = [18, 34], margin = 2, avoid = null } = {}) {
  return callouts.map((c) => {
    for (const L of leaders) for (const [dx, dy] of DIRS) {
      const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const ax = c.x + ux * (c.r + L), ay = c.y + uy * (c.r + L); // the leader's end
      const x0 = dx > 0 ? ax : dx < 0 ? ax - c.w : ax - c.w / 2;
      const y0 = dy > 0 ? ay : dy < 0 ? ay - c.h : ay - c.h / 2;
      const box = { x0, y0, x1: x0 + c.w, y1: y0 + c.h };
      if (box.x0 < margin || box.y0 < margin || box.x1 > view.w - margin || box.y1 > view.h - margin) continue;
      const grown = { x0: box.x0 - margin, y0: box.y0 - margin, x1: box.x1 + margin, y1: box.y1 + margin };
      if (index.hits(grown) || avoid?.hits(grown)) continue;
      index.add(box);
      return { box, from: { x: c.x + ux * (c.r + 1), y: c.y + uy * (c.r + 1) }, to: { x: ax, y: ay } };
    }
    return null;
  });
}

// plain labels at (x + dx, y), text centred on y: [{ x, y, w }] -> the indices placed (clear of the index; each placed one added)
export function placeLabels(labels, index, h = 13, dx = 5, gap = 4) { // gap: room after a label, so the next one does not run into it
  const out = [];
  labels.forEach((l, i) => {
    if (!Number.isFinite(l?.x) || !Number.isFinite(l?.y)) return;
    const r = { x0: l.x + dx - 1, y0: l.y - h / 2, x1: l.x + dx + l.w + gap, y1: l.y + h / 2 };
    if (index.hits(r)) return;
    index.add(r);
    out.push(i);
  });
  return out;
}

// The ids on the plan: ctx a canvas 2D context; collars: the rows (hole_id, x, y); X / Y: world -> pixel; view { w, h };
// colourOf(c) -> a colour, null (no value: a grey ring) or undefined (no colouring: no swatch); dotR: the dot radius; more(n) -> '+n more'.
// Pads get a callout, single holes their id; a pad whose callout has no room, a short label 'first id +n'. -> { pads, callouts, labels }
export function drawCallouts(ctx, collars, X, Y, view, { colourOf, dotR = 3, mPerPx, more = (n) => `+${n} more` } = {}) {
  const world = [], screen = [], rows = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const px = X(c.x), py = Y(c.y);
    if (px < -60 || py < -10 || px > view.w + 10 || py > view.h + 10) continue;
    world.push(c); screen.push({ x: px, y: py }); rows.push(c);
  }
  const pads = collarPads(world, screen, mPerPx);
  const index = new RectIndex(), dots = new RectIndex();
  for (const p of screen) dots.add({ x0: p.x - dotR, y0: p.y - dotR, x1: p.x + dotR, y1: p.y + dotR }); // a box leaves the markers visible (a label may cross one, as before)
  const multi = pads.filter((p) => p.members.length > 1);
  const id = (i) => String(rows[i].hole_id ?? "");
  const swatches = typeof colourOf === "function" && rows.some((c) => colourOf(c) !== undefined);
  ctx.font = "10px sans-serif"; ctx.textBaseline = "middle";
  const ROW = 12, PADX = 4, SW = swatches ? 11 : 0;
  const callouts = multi.length <= MAX_CALLOUTS ? multi.map((p) => {
    const list = p.members.length > MAX_LISTED ? p.members.slice(0, MAX_LISTED - 1) : p.members;
    const lines = list.map(id), extra = p.members.length - list.length;
    let tw = 0;
    for (const t of lines) tw = Math.max(tw, ctx.measureText(t).width);
    if (extra) tw = Math.max(tw, ctx.measureText(more(extra)).width - SW);
    return { x: p.x, y: p.y, r: p.r + dotR + 2, w: Math.ceil(PADX * 2 + SW + tw), h: ROW * (lines.length + (extra ? 1 : 0)) + 4, list, extra };
  }) : [];
  // the rings round the pads first (a pad reads as one marker), then the boxes where they fit
  ctx.lineWidth = 1.2; ctx.strokeStyle = "#1a2028";
  for (const p of multi) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r + dotR + 2, 0, Math.PI * 2); ctx.stroke(); }
  const placed = placeCallouts(callouts, index, view, { avoid: dots });
  let nCallouts = 0;
  placed.forEach((pl, k) => {
    if (!pl) return;
    nCallouts++;
    const c = callouts[k], b = pl.box;
    ctx.strokeStyle = "#1a2028"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pl.from.x, pl.from.y); ctx.lineTo(pl.to.x, pl.to.y); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.94)"; ctx.fillRect(b.x0, b.y0, c.w, c.h); ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, c.w - 1, c.h - 1);
    c.list.forEach((i, r) => {
      const ty = b.y0 + 2 + ROW * r + ROW / 2;
      if (swatches) {
        const col = colourOf(rows[i]);
        ctx.beginPath(); ctx.arc(b.x0 + PADX + 4, ty, 3.5, 0, Math.PI * 2);
        if (col) { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = "#1a2028"; ctx.stroke(); } else { ctx.strokeStyle = "#8a9099"; ctx.stroke(); }
      }
      ctx.fillStyle = "#1a2028"; ctx.fillText(id(i), b.x0 + PADX + SW, ty);
    });
    if (c.extra) { ctx.fillStyle = "#4a525c"; ctx.fillText(more(c.extra), b.x0 + PADX, b.y0 + 2 + ROW * c.list.length + ROW / 2); }
  });
  // single holes, and pads with no room for a box, as labels
  const placedOf = new Map(multi.map((p, k) => [p, callouts.length ? placed[k] : null]));
  const labels = pads.filter((p) => p.members.length === 1 || !placedOf.get(p)).map((p) => {
    const t = p.members.length > 1 ? `${id(p.members[0])} +${p.members.length - 1}` : id(p.members[0]);
    return { x: p.x + (p.members.length > 1 ? p.r + dotR : 0), y: p.y, w: ctx.measureText(t).width, t };
  });
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "#1a2028";
  const shown = placeLabels(labels, index);
  for (const i of shown) { const l = labels[i]; ctx.strokeText(l.t, l.x + 5, l.y); ctx.fillText(l.t, l.x + 5, l.y); }
  return { pads: multi.length, callouts: nCallouts, labels: shown.length };
}
