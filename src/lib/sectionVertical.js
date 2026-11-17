// TASKS.csv #3880 (a GeoStrix user, via Matt, 2026-11-17: "not being able to match cross section with terrain in elevation") — a georeferenced section image stands in the 3D View at the elevations its two or three
// control points were typed with, and nothing could change that afterwards: the section's own topography line floated above (or under) the draped terrain and the only way out was to remove the image and tie it
// again. This is the vertical part of the cure, as pure functions: the image's frame (where a picture pixel is in the world), the terrain's profile along the image in picture pixels (to draw over it), the
// picture's own vertical exaggeration (stated, never applied: the placement is in metres), the heights the user's clicks on the DRAWN topography line stand at against the terrain under them, and the offset
// (and, with three or more clicks, the scale) that brings the two together. The corners are the only thing changed: z' = pivot + scale x (z - pivot) + offset, the same linear map on all four, so the picture is
// moved and stretched vertically exactly as the clicks ask and its horizontal placement is untouched.
import { terrainGroundAt } from "./viewer/geomath.js";

const finite = (v) => v !== "" && v != null && Number.isFinite(Number(v));

// corners: [[x, y, z] TL, TR, BR, BL] (sectionGeoref.js sectionImageCorners). -> the pieces every mapping needs, or null
export function imageFrame(im) {
  const c = im?.corners;
  if (!Array.isArray(c) || c.length !== 4 || !(im.width > 0) || !(im.height > 0)) return null;
  const [tl, tr, , bl] = c;
  const hx = tr[0] - tl[0], hy = tr[1] - tl[1], hLen = Math.hypot(hx, hy);
  if (!(hLen > 0)) return null;
  return { tl, tr, bl, W: im.width, H: im.height, hLen, ux: hx / hLen, uy: hy / hLen, zTL: tl[2], zTR: tr[2], zBL: bl[2] };
}

// the world position of a picture pixel (y down): the quad is a parallelogram, so TL + u x (TR - TL) + v x (BL - TL)
export function pxToWorld(im, px, py) {
  const f = imageFrame(im);
  if (!f) return null;
  const u = px / f.W, v = py / f.H;
  return { x: f.tl[0] + u * (f.tr[0] - f.tl[0]) + v * (f.bl[0] - f.tl[0]), y: f.tl[1] + u * (f.tr[1] - f.tl[1]) + v * (f.bl[1] - f.tl[1]), z: f.tl[2] + u * (f.tr[2] - f.tl[2]) + v * (f.bl[2] - f.tl[2]) };
}
// the picture pixel at a world position on the image's plane (x, y along the line, z the height): the way back, for drawing the terrain over the picture
export function worldToPx(im, x, y, z) {
  const f = imageFrame(im);
  if (!f) return null;
  const u = ((x - f.tl[0]) * f.ux + (y - f.tl[1]) * f.uy) / f.hLen; // along the picture's top edge
  const dz = f.zBL - f.zTL, v = Math.abs(dz) > 1e-9 ? (z - f.zTL - u * (f.zTR - f.zTL)) / dz : NaN;
  return { px: u * f.W, py: v * f.H };
}

// the picture's own vertical exaggeration: its vertical pixels per metre over its horizontal ones (a section drawn at 2 : 1 reads 2). The 3D View places it in metres, so this is only stated.
export function imageVE(im) {
  const f = imageFrame(im);
  if (!f) return null;
  const mh = f.hLen / f.W, mv = Math.abs(f.zTL - f.zBL) / f.H; // metres per pixel across and down
  return mv > 0 ? mh / mv : null;
}

// the same linear map on the four corners' heights. scale 1 and offset 0 leave them as they are
export function adjustCorners(corners, { offset = 0, scale = 1, pivot = 0 } = {}) {
  return corners.map(([x, y, z]) => [x, y, pivot + scale * (z - pivot) + offset]);
}
// the picture with its corners adjusted (for drawing a preview)
export const adjustedImage = (im, adj) => ({ ...im, corners: adjustCorners(im.corners, adj) });

// the terrain along the picture, as runs of picture pixels [[px, py], ...] (a break where the terrain does not cover or the line leaves the picture's width). n samples across the picture
export function terrainProfilePx(im, terrain, n = 240) {
  const f = imageFrame(im);
  if (!f || !terrain?.bbox) return [];
  const runs = []; let run = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = f.tl[0] + u * (f.tr[0] - f.tl[0]), y = f.tl[1] + u * (f.tr[1] - f.tl[1]), z = terrainGroundAt(terrain, x, y);
    const p = Number.isFinite(z) ? worldToPx(im, x, y, z) : null;
    if (p && Number.isFinite(p.py)) run.push([p.px, p.py]); else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

// the user's clicks on the drawn topography line: [{ px, py }] -> for each, the height it is placed at now, the terrain's under it, and the difference (terrain - picture). Clicks over no terrain are left out
export function topoPicks(im, picks, terrain) {
  const out = [];
  for (const p of picks || []) {
    const w = pxToWorld(im, p.px, p.py);
    if (!w) continue;
    const zt = terrain ? terrainGroundAt(terrain, w.x, w.y) : NaN;
    if (!Number.isFinite(zt)) continue;
    out.push({ id: p.id, px: p.px, py: p.py, x: w.x, y: w.y, zImage: w.z, zTerrain: zt, diff: zt - w.z });
  }
  return out;
}
const rms = (a) => (a.length ? Math.sqrt(a.reduce((t, x) => t + x * x, 0) / a.length) : null);

// The offset (mode "offset": the mean difference) or the offset and scale (mode "scale": least squares of terrain on picture height, from three clicks that differ in height by at least 5 m) that
// bring the picks to the terrain. -> { offset, scale, pivot, rmsBefore, rmsAfter, n } or { error }
export function fitVertical(rows, mode = "offset") {
  const n = rows?.length || 0;
  if (!n) return { error: "Click along the drawn topography line first." };
  const zi = rows.map((r) => r.zImage), zt = rows.map((r) => r.zTerrain), mi = zi.reduce((t, x) => t + x, 0) / n, mt = zt.reduce((t, x) => t + x, 0) / n;
  const rmsBefore = rms(rows.map((r) => r.diff));
  if (mode === "scale") {
    const sxx = zi.reduce((t, x) => t + (x - mi) ** 2, 0), sxy = zi.reduce((t, x, i) => t + (x - mi) * (zt[i] - mt), 0);
    if (n < 3 || Math.max(...zi) - Math.min(...zi) < 5 || !(sxx > 0)) return { error: "To fit the height and the scale, click at least 3 points that differ in height by 5 m or more (the line's highs and lows); or fit the height only." };
    const scale = sxy / sxx;
    if (!(scale > 0.25 && scale < 4)) return { error: "That fit would stretch the picture more than 4 times (or flip it): check the clicks, or fit the height only." };
    const offset = mt - mi;
    return { offset, scale, pivot: mi, rmsBefore, rmsAfter: rms(rows.map((r) => r.zTerrain - (mi + scale * (r.zImage - mi) + offset))), n };
  }
  const offset = mt - mi;
  return { offset, scale: 1, pivot: mi, rmsBefore, rmsAfter: rms(rows.map((r) => r.zTerrain - (r.zImage + offset))), n };
}

// the numbers the dialog types: a typed offset (m) and scale (%) -> the adjustment, or null when they are not numbers
export function typedAdjustment({ offset, scalePct, pivot }) {
  if (!finite(offset) || !finite(scalePct) || !(Number(scalePct) > 0)) return null;
  return { offset: Number(offset), scale: Number(scalePct) / 100, pivot: Number.isFinite(pivot) ? pivot : 0 };
}
