// TASKS.csv #3971 (Matt's first-time test, Macpass: "I want to have the option to draw a box here before generating fence series and that will be
// my boundary for the fence series") — a fence series over a box: the box is turned to the series azimuth (its long sides along the section
// lines), the sections are only those across it, each line cut at its edges, and the count says how many before any is made. Pure.
// A box: { cx, cy, len, wid } in project coordinates: its centre, its length ALONG the section lines (the series azimuth) and its width
// ACROSS them; the azimuth is the series', so turning the azimuth turns the box about its centre.
import { fenceLinesWithData } from "./sectionDefs.js";
import { fetchAreaChoices } from "./fetchAreas.js"; // #3954 — the project's boundaries and claims, with their outlines

const toRad = (d) => (d * Math.PI) / 180;
const norm360 = (d) => ((Number(d) % 360) + 360) % 360;
// the series' frame: s along the lines (the azimuth), t across them, as generateSliceSeries measures them
export function seriesFrame(azimuth) {
  const a = toRad(norm360(azimuth));
  return { dirX: Math.sin(a), dirY: Math.cos(a), perpX: Math.cos(a), perpY: -Math.sin(a) };
}
export const isBox = (b) => !!b && [b.cx, b.cy, b.len, b.wid].every(Number.isFinite) && b.len > 0 && b.wid > 0;

// the box's s / t ranges in the series' frame
export function boxRange(box, azimuth) {
  const f = seriesFrame(azimuth), s = box.cx * f.dirX + box.cy * f.dirY, t = box.cx * f.perpX + box.cy * f.perpY;
  return { s0: s - box.len / 2, s1: s + box.len / 2, t0: t - box.wid / 2, t1: t + box.wid / 2 };
}
// its four corners in project coordinates, in order round the box: [s0 t0], [s1 t0], [s1 t1], [s0 t1]
export function boxCorners(box, azimuth) {
  const f = seriesFrame(azimuth), r = boxRange(box, azimuth);
  const at = (s, t) => ({ x: s * f.dirX + t * f.perpX, y: s * f.dirY + t * f.perpY });
  return [at(r.s0, r.t0), at(r.s1, r.t0), at(r.s1, r.t1), at(r.s0, r.t1)];
}
// the box from two opposite corners (a drag on the map, or a corner moved with the opposite one held), turned to the azimuth
export function boxFromCorners(p, q, azimuth) {
  const f = seriesFrame(azimuth);
  const sp = p.x * f.dirX + p.y * f.dirY, tp = p.x * f.perpX + p.y * f.perpY, sq = q.x * f.dirX + q.y * f.dirY, tq = q.x * f.perpX + q.y * f.perpY;
  const s = (sp + sq) / 2, t = (tp + tq) / 2;
  return { cx: s * f.dirX + t * f.perpX, cy: s * f.dirY + t * f.perpY, len: Math.abs(sq - sp), wid: Math.abs(tq - tp) };
}
// a corner (0-3, boxCorners' order) dragged to `to`: the opposite corner stays
export const moveCorner = (box, azimuth, i, to) => boxFromCorners(boxCorners(box, azimuth)[(i + 2) % 4], to, azimuth);
// a box round the outline of a boundary or claim (its closed loops, [[x, y], ...]), turned to the azimuth, with a margin
export function boxAround(outline, azimuth, marginM = 0) {
  const f = seriesFrame(azimuth);
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const ring of outline || []) for (const [x, y] of ring) {
    const s = x * f.dirX + y * f.dirY, t = x * f.perpX + y * f.perpY;
    if (s < s0) s0 = s; if (s > s1) s1 = s; if (t < t0) t0 = t; if (t > t1) t1 = t;
  }
  if (!(s1 > s0 && t1 > t0)) return null;
  const m = Math.max(0, Number(marginM) || 0), s = (s0 + s1) / 2, t = (t0 + t1) / 2;
  return { cx: s * f.dirX + t * f.perpX, cy: s * f.dirY + t * f.perpY, len: s1 - s0 + 2 * m, wid: t1 - t0 + 2 * m };
}

// the box of a series area: null / { kind: "all" } -> null (all the drilling); { kind: "box", box } -> that box; { kind: "boundary", id } -> the box
// round that boundary or claim (its outline from #3954's list, lib/fetchAreas.js), turned to the azimuth; a boundary that is gone -> null
export function areaBox(area, azimuth, boundaries = []) {
  if (!area || area.kind === "all") return null;
  if (area.kind === "box") return isBox(area.box) ? area.box : null;
  if (area.kind === "boundary") {
    const c = fetchAreaChoices({ boundaries }, { marginM: 0 }).find((o) => o.id === `boundary_${area.id}`);
    return c?.outline ? boxAround(c.outline, azimuth, area.margin || 0) : null;
  }
  return null;
}

// The series' lines with data, as fenceLinesWithData finds them, kept to the box: the data inside it, the lines across it, each cut at its
// ends (s0 / s1). No box: as before. -> { lines, empty, s0?, s1? }
export function fenceLinesInBox(pts, azimuth, width, traces = null, box = null) {
  if (!isBox(box)) return fenceLinesWithData(pts, azimuth, width, traces);
  const f = seriesFrame(azimuth), r = boxRange(box, azimuth);
  const inside = (pts || []).filter((p) => { const s = p.x * f.dirX + p.y * f.dirY, t = p.x * f.perpX + p.y * f.perpY; return s >= r.s0 && s <= r.s1 && t >= r.t0 && t <= r.t1; });
  if (!inside.length) return { lines: [], all: 0, empty: 0, s0: r.s0, s1: r.s1 };
  const got = fenceLinesWithData(inside, azimuth, width, traces);
  const lines = got.lines.filter((ln) => ln.t >= r.t0 && ln.t <= r.t1);
  return { lines, all: got.all, empty: got.empty + (got.lines.length - lines.length), s0: r.s0, s1: r.s1 };
}
