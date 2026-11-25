// TASKS.csv #630 — georeferencing a VERTICAL image (a scanned or exported cross-section) so it stands in the 3D view
// where it belongs. The plan-view georeferencer (#129, georef.js) maps pixels to (easting, northing); a section maps
// pixels to (distance along the section line, elevation), and the section line (start A -> end B, in project
// coordinates) puts that plane in the world. Pure functions — the modal gathers the inputs.
//
// Control points: { px, py, h, hKind, z } — px/py in source pixels (y down), z the elevation, h the horizontal
// position read off the figure: hKind "distance" (metres from A), "easting" or "northing" (converted to a
// distance along A->B, which needs a line that isn't perpendicular to that axis).
//   2 points: scale + offset per axis (no rotation) — enough for a clean, square figure (two grid-line crossings).
//   3+ points: full affine by least squares (georef.js fitAffine) — handles a slightly rotated or skewed scan.
import { fitAffine, forwardMap } from "./georef.js";
import { arrMin, arrMax } from "./arrayStats.js"; // no Math.min/max spread (#3031)

export function sectionLine(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) throw new Error("The two ends are the same: give two different points.");
  return { a, b, length, ux: dx / length, uy: dy / length, azimuth: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
}

// horizontal reading -> distance along the line from A
export function alongDistance(line, hKind, h) {
  const v = Number(h);
  if (!Number.isFinite(v)) throw new Error("A control point has no horizontal value.");
  if (hKind === "distance") return v;
  const axis = hKind === "easting" ? "x" : "y";
  const u = axis === "x" ? line.ux : line.uy;
  if (Math.abs(u) < 0.02) throw new Error(`This line runs ${axis === "x" ? "north–south" : "east–west"}: use ${axis === "x" ? "northings" : "eastings"} or distances.`);
  return (v - line.a[axis]) / u;
}

export function fitSectionTransform(points, line) {
  const pts = points.map((p) => ({ px: p.px, py: p.py, x: alongDistance(line, p.hKind, p.h), y: Number(p.z) }));
  if (pts.some((p) => !Number.isFinite(p.y))) throw new Error("A control point has no elevation.");
  if (pts.length < 2) throw new Error("Place at least 2 control points.");
  if (pts.length === 2) {
    const [p, q] = pts;
    if (Math.abs(q.px - p.px) < 1 || Math.abs(q.py - p.py) < 1) throw new Error("Pick two corners that differ both across and up the image.");
    const a = (q.x - p.x) / (q.px - p.px), e = (q.y - p.y) / (q.py - p.py);
    return { t: { a, b: 0, c: p.x - a * p.px, d: 0, e, f: p.y - e * p.py }, pts, kind: "scale" };
  }
  return { t: fitAffine(pts), pts, kind: "affine" };
}

export function sectionResiduals(fit) {
  return fit.pts.map((p) => {
    const m = forwardMap(fit.t, p.px, p.py);
    return { dDist: m.x - p.x, dZ: m.y - p.y, error: Math.hypot(m.x - p.x, m.y - p.y) };
  });
}

// the image's four corners in the world: [x, y, z] for top-left, top-right, bottom-right, bottom-left. An affine maps
// the rectangle to a parallelogram, so a two-triangle quad with plain UVs reproduces it exactly.
export function sectionImageCorners(fit, line, width, height) {
  return [[0, 0], [width, 0], [width, height], [0, height]].map(([px, py]) => {
    const { x: d, y: z } = forwardMap(fit.t, px, py);
    return [line.a.x + d * line.ux, line.a.y + d * line.uy, z];
  });
}

// a sanity summary for the dialog: extent along the line and in elevation, and whether elevation increases upward
export function sectionFitSummary(fit, width, height) {
  const ds = [forwardMap(fit.t, 0, 0).x, forwardMap(fit.t, width, height).x];
  const zTop = forwardMap(fit.t, width / 2, 0).y, zBottom = forwardMap(fit.t, width / 2, height).y;
  return { fromDist: Math.min(...ds), toDist: Math.max(...ds), zTop, zBottom, upsideDown: zTop < zBottom, mirrored: ds[1] < ds[0] };
}

// TASKS.csv #631 — which georeferenced section images lie on a cross-section (so the section window can draw them
// behind the holes and contacts), and where: the image's top-left, top-right and bottom-left corners as (distance
// along the section, elevation). An image counts when its line runs within `maxAngle`° of the section's (either
// direction) and every corner is within `maxOffset` m of the section line (the section's corridor, at least 10 m).
// section: { ax, ay, bx, by }; images: [{ id, name, corners: [[x,y,z] TL, TR, BR, BL], visible, … }]
export function sectionImagesOnSection(images, section, maxOffset = 10, maxAngle = 3) {
  const dx = section.bx - section.ax, dy = section.by - section.ay, len = Math.hypot(dx, dy);
  if (!(len > 0)) return [];
  const ux = dx / len, uy = dy / len;
  const along = ([x, y]) => (x - section.ax) * ux + (y - section.ay) * uy;
  const across = ([x, y]) => Math.abs(-(x - section.ax) * uy + (y - section.ay) * ux);
  const out = [];
  for (const im of images || []) {
    if (im.visible === false || !Array.isArray(im.corners) || im.corners.length !== 4) continue;
    const [tl, tr, , bl] = im.corners;
    const ix = tr[0] - tl[0], iy = tr[1] - tl[1], il = Math.hypot(ix, iy);
    if (!(il > 0)) continue;
    const cos = Math.abs((ix * ux + iy * uy) / il);
    if (cos < Math.cos((maxAngle * Math.PI) / 180)) continue;
    if (im.corners.some((c) => across(c) > Math.max(10, maxOffset))) continue;
    out.push({ id: im.id, name: im.name, opacity: im.opacity ?? 1, tl: [along(tl), tl[2]], tr: [along(tr), tr[2]], bl: [along(bl), bl[2]], offset: Math.max(...im.corners.map(across)) });
  }
  return out;
}

// TASKS.csv #3924 — a user georeferenced three figures and all three stood on one line: the dialog had preselected the first saved section, and
// the clicks on a figure only set where it sits ALONG its line and how high, never which line. The dialog now asks for the line first, on a plan,
// with nothing preselected; these are its pure parts.

// the line a placed figure stands on: the one saved with it, or (an older figure) the line through its top corners, starting at its left edge
export function imageLine(im) {
  const l = im?.line;
  if (l?.a && l?.b && Number.isFinite(l.a.x) && Number.isFinite(l.b.y) && Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) > 0) return sectionLine(l.a, l.b);
  const c = im?.corners;
  if (!Array.isArray(c) || c.length !== 4) return null;
  const [tl, tr] = c;
  if (!(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) > 0)) return null;
  return sectionLine({ x: tl[0], y: tl[1] }, { x: tr[0], y: tr[1] });
}

// the figures already standing on this line (within 3° and 10 m), but `exceptId`: said in one line before a second figure goes on it
export function imagesOnLine(images, line, exceptId = null) {
  if (!line || line.error) return [];
  const on = sectionImagesOnSection((images || []).filter((im) => im.id !== exceptId).map((im) => ({ ...im, visible: true })), { ax: line.a.x, ay: line.a.y, bx: line.b.x, by: line.b.y }, 10, 3);
  return on.map((m) => ({ id: m.id, name: m.name }));
}

// move a placed figure to another line without its control points: each corner keeps its distance from the line's start and its elevation.
// A fit at each point (#3929) keeps its original corners too; they move alike, so "Back to as georeferenced" lands on the new line.
export function moveSectionImage(im, to) {
  const from = imageLine(im);
  if (!from) throw new Error("This figure has no position to move.");
  const move = (cs) => cs.map(([x, y, z]) => { const d = (x - from.a.x) * from.ux + (y - from.a.y) * from.uy; return [to.a.x + d * to.ux, to.a.y + d * to.uy, z]; });
  const along = im.corners.map(([x, y]) => (x - from.a.x) * from.ux + (y - from.a.y) * from.uy);
  return {
    patch: { corners: move(im.corners), ...(Array.isArray(im.corners0) && im.corners0.length === 4 ? { corners0: move(im.corners0) } : {}), line: { a: { x: to.a.x, y: to.a.y }, b: { x: to.b.x, y: to.b.y } } },
    fromDist: arrMin(along), toDist: arrMax(along),
  };
}

// the plan's frame: the collars, the saved sections, the placed figures and the chosen line, with a margin; null when there is nothing to frame
export function planFrame({ collars = [], sections = [], images = [], line = null } = {}, margin = 0.08) {
  const xs = [], ys = [];
  const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } };
  for (const c of collars) add(Number(c.x), Number(c.y));
  for (const s of sections) { add(s.ax, s.ay); add(s.bx, s.by); }
  for (const im of images) for (const c of im.corners || []) add(c[0], c[1]);
  if (line && !line.error) { add(line.a.x, line.a.y); add(line.b.x, line.b.y); }
  if (!xs.length) return null;
  const x0 = arrMin(xs), x1 = arrMax(xs), y0 = arrMin(ys), y1 = arrMax(ys);
  const span = Math.max(x1 - x0, y1 - y0, 100), m = span * margin;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, h = span / 2 + m;
  return { x0: cx - h, x1: cx + h, y0: cy - h, y1: cy + h };
}
