// TASKS.csv #1639 (review #1497, Lawyers) — a drill-hole location plan for the Layout: collars as symbols, traces as 0.3 mm lines,
// labels that do not overlap, drawn from the collars at a true map scale and independent of what the 3D scene shows. On Lawyers a
// plan of the 446 holes could not be made: at 1:20,000 the traces were 1 px lines under soils and geophysics, with no collar
// symbol or label. Pure functions; the drawing is components/DrillPlanElement.jsx.

export const PAGE_PX_PER_PAPER_M = 96 / 0.0254; // the Layout sheet is 96 px per inch
export const pxPerMetre = (scale) => PAGE_PX_PER_PAPER_M / Math.max(1, Number(scale) || 1);

// The hole in plan, straight from the collar's azimuth, dip and length (a survey bends it little at plan scale). Dip may be
// stored positive or negative downwards; 90 (or none) is vertical, a point.
export function holePlan(c) {
  const az = ((Number(c.azimuth) || 0) * Math.PI) / 180, dip = ((Math.abs(Number(c.dip)) || 90) * Math.PI) / 180;
  const horiz = (Number(c.length) || 0) * Math.cos(dip);
  return { x0: c.x, y0: c.y, x1: c.x + Math.sin(az) * horiz, y1: c.y + Math.cos(az) * horiz };
}

const finite = (c) => Number.isFinite(c?.x) && Number.isFinite(c?.y);
export const filterHoles = (collars, filter) => {
  const f = String(filter || "").trim().toLowerCase();
  return (collars || []).filter((c) => finite(c) && (!f || String(c.hole_id ?? "").toLowerCase().includes(f)));
};

// The scale (from `presets`, smallest first) and centre that show every hole (collar and trace) inside a w x h px frame with a margin.
export function fitDrillPlan(collars, w, h, presets = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]) {
  const cs = (collars || []).filter(finite);
  if (!cs.length) return null;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const c of cs) { const p = holePlan(c); for (const [x, y] of [[p.x0, p.y0], [p.x1, p.y1]]) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; } }
  const spanX = Math.max(1, xmax - xmin), spanY = Math.max(1, ymax - ymin), m = 0.88; // 6 % margin each side
  const need = Math.max(spanX / (w * m), spanY / (h * m)) * PAGE_PX_PER_PAPER_M; // the 1:N that just fits
  const scale = presets.find((s) => s >= need) || Math.ceil(need / 1000) * 1000;
  return { scale, centre: { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 } };
}

// A hole's series: its id without the trailing number (21CCDD042 -> 21CCDD; 21AGBDD043B -> 21AGBDD), the year / prospect / type prefix drill programs use.
// A letter after the number (a re-drill, 21AGBDD043B) stays in its series.
export const holeSeries = (id) => String(id ?? "").replace(/[-_ ]?\d+[A-Za-z]?$/, "") || String(id ?? "");

// Labels placed greedily (right, left, above, below the collar), each kept only when it overlaps no label already placed and stays
// inside the frame. points: [{ id, x, y }] in frame px. -> { placed: [{ id, x, y, anchor }], skipped }
export function placeLabels(points, { fontPx = 9, w, h, gap = 5 } = {}) {
  const placed = [], boxes = [];
  let skipped = 0;
  const hit = (b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  for (const p of points) {
    const tw = String(p.id).length * fontPx * 0.56, th = fontPx;
    const tries = [
      { anchor: "start", x: p.x + gap, y: p.y + th * 0.35, b: { x0: p.x + gap, x1: p.x + gap + tw, y0: p.y - th / 2, y1: p.y + th / 2 } },
      { anchor: "end", x: p.x - gap, y: p.y + th * 0.35, b: { x0: p.x - gap - tw, x1: p.x - gap, y0: p.y - th / 2, y1: p.y + th / 2 } },
      { anchor: "middle", x: p.x, y: p.y - gap - 1, b: { x0: p.x - tw / 2, x1: p.x + tw / 2, y0: p.y - gap - th, y1: p.y - gap } },
      { anchor: "middle", x: p.x, y: p.y + gap + th, b: { x0: p.x - tw / 2, x1: p.x + tw / 2, y0: p.y + gap, y1: p.y + gap + th } },
    ];
    const ok = tries.find((t) => t.b.x0 >= 0 && t.b.x1 <= w && t.b.y0 >= 0 && t.b.y1 <= h && !hit(t.b));
    if (ok) { boxes.push(ok.b); placed.push({ id: p.id, x: ok.x, y: ok.y, anchor: ok.anchor }); } else skipped++;
  }
  return { placed, skipped };
}

// Everything the element draws, in frame px (north up, centre of the frame = el.centre). Holes wholly outside are left out.
export function drillPlanGeometry(el, collars) {
  const w = el.w || 600, h = el.h || 400, ppm = pxPerMetre(el.scale), cx = el.centre?.x ?? 0, cy = el.centre?.y ?? 0;
  const toPx = (x, y) => [w / 2 + (x - cx) * ppm, h / 2 - (y - cy) * ppm];
  const holes = [];
  for (const c of filterHoles(collars, el.holeFilter)) {
    const p = holePlan(c), [ax, ay] = toPx(p.x0, p.y0), [bx, by] = toPx(p.x1, p.y1);
    if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > w || Math.max(ay, by) < 0 || Math.min(ay, by) > h) continue;
    holes.push({ id: String(c.hole_id ?? ""), series: holeSeries(c.hole_id), ax, ay, bx, by, inside: ax >= 0 && ax <= w && ay >= 0 && ay <= h });
  }
  return { w, h, ppm, holes };
}
