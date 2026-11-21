// TASKS.csv #3929 (a GeoStrix user, via Matt, 2026-11-19: "Do you have another tool to make some vertices to make the terrain line fit with the image?") —
// "Fit at each point" in Match to terrain (#3880). A hand-drawn section is not to scale everywhere, so one height and one vertical scale cannot lay its
// drawn ground on the terrain. Here the points the user clicks on the drawn topography line become the vertices of a piecewise vertical warp of the PICTURE
// (never of the terrain):
//  - the whole picture moves by the mean difference (terrain - picture) at the clicks: the rigid part, as "Fit the height" does;
//  - what is left at each click (its difference minus the mean) is interpolated linearly between the clicks along the picture (held at the end values
//    beyond the first and last click) and bends each column by that much at the drawn ground;
//  - the bend fades linearly to nothing at `depthM` below the drawn ground, and below that the picture only moves rigidly, so the holes and units drawn
//    deeper on the figure are not bent (the depth is the user's; the dialog offers a fifth of the picture's height, said as a starting value).
// The warped picture is a new bitmap, a little taller than the old one (the margins the bends need), on corners extended by those margins: the 3D view,
// the section window and the exports draw it as they draw any section image. The bitmap and corners it was georeferenced with are kept for "Back".
// Pure (no DOM): the resampling's maths are here (sourceRow); the dialog runs them over the pixels. Picture pixels: x across, y down.
import { imageFrame, pxToWorld } from "./sectionVertical.js";

// linear interpolation through the vertices [{ px, v }] sorted by px, held at the ends
export function interp(vertices, px) {
  const n = vertices.length;
  if (!n) return 0;
  if (px <= vertices[0].px) return vertices[0].v;
  if (px >= vertices[n - 1].px) return vertices[n - 1].v;
  let i = 1;
  while (vertices[i].px < px) i++;
  const a = vertices[i - 1], b = vertices[i], t = (px - a.px) / (b.px - a.px || 1);
  return a.v + t * (b.v - a.v);
}

// rows: topoPicks(im, picks, terrain) ([{ id, px, py, diff }]); depthM: how far below the drawn ground the bend reaches (m).
// -> the plan, or { error }
export function warpPlan(im, rows, { depthM } = {}) {
  const f = imageFrame(im);
  if (!f) return { error: "The picture has no georeference." };
  const pts = (rows || []).filter((r) => Number.isFinite(r.diff) && Number.isFinite(r.px) && Number.isFinite(r.py)).slice().sort((a, b) => a.px - b.px);
  if (pts.length < 2) return { error: "Click at least 2 points along the drawn topography line to fit at each point." };
  for (let i = 1; i < pts.length; i++) if (pts[i].px - pts[i - 1].px < 1) return { error: "Two clicks are in the same column of the picture: remove one of them." };
  const mPerPx = Math.abs(f.zTL - f.zBL) / f.H; // metres per picture pixel, down
  if (!(mPerPx > 0)) return { error: "The picture has no height in metres." };
  const mean = pts.reduce((t, r) => t + r.diff, 0) / pts.length;
  const bend = pts.map((r) => ({ px: r.px, v: (r.diff - mean) / mPerPx })); // the bend at each click, in pixels, up positive
  const ground = pts.map((r) => ({ px: r.px, v: r.py })); // the drawn ground's row
  const maxBendPx = Math.max(...bend.map((b) => Math.abs(b.v)));
  // the bend fades over fadePx: at least twice the largest bend, so no column folds back on itself
  const wanted = Number(depthM) > 0 ? Number(depthM) / mPerPx : f.H / 5;
  const fadePx = Math.max(wanted, 2 * maxBendPx, 1);
  const upPx = Math.ceil(Math.max(0, ...bend.map((b) => b.v))), downPx = Math.ceil(Math.max(0, ...bend.map((b) => -b.v)));
  // residuals: each click's distance from the straight trend (least squares of the difference along the picture) through all the clicks. The warp
  // passes through every click, so this is what it bends to reach each one: a large one marks a click off the drawn line, or a sharp kink there
  const n = pts.length, mx = pts.reduce((t, r) => t + r.px, 0) / n, sxx = pts.reduce((t, r) => t + (r.px - mx) ** 2, 0);
  const slope = sxx > 0 ? pts.reduce((t, r) => t + (r.px - mx) * (r.diff - mean), 0) / sxx : 0;
  const residuals = pts.map((r, i) => ({ id: r.id, diff: r.diff, bendM: bend[i].v * mPerPx, offTrendM: r.diff - (mean + slope * (r.px - mx)) }));
  return { mean, mPerPx, bend, ground, fadePx, depthM: fadePx * mPerPx, upPx, downPx, W: f.W, H: f.H, newH: f.H + upPx + downPx, maxBendM: maxBendPx * mPerPx, residuals, n: pts.length };
}

// how far the content at source row `y` of column `x` moves up (pixels): the full bend above the drawn ground, fading to 0 at fadePx below it
export function bendAt(plan, x, y) {
  const s = interp(plan.bend, x), g = interp(plan.ground, x);
  const k = y <= g ? 1 : y >= g + plan.fadePx ? 0 : 1 - (y - g) / plan.fadePx;
  return s * k;
}
// the destination row of a source pixel, in the taller picture (upPx of margin on top)
export const destRow = (plan, x, y) => y + plan.upPx - bendAt(plan, x, y);

// the source row a destination row of column x reads (the inverse of destRow, which is piecewise linear and rising in y), or null outside the picture
export function sourceRow(plan, x, d) {
  const s = interp(plan.bend, x), g = interp(plan.ground, x), F = plan.fadePx, up = plan.upPx;
  // above the ground: d = y + up - s
  let y = d - up + s;
  if (y <= g) return y >= 0 && y <= plan.H - 1 ? y : null;
  // in the fade: d = y + up - s (1 - (y - g) / F)  ->  y (1 + s / F) = d - up + s + s g / F
  y = (d - up + s + (s * g) / F) / (1 + s / F);
  if (y > g && y < g + F) return y <= plan.H - 1 ? y : null;
  // below: d = y + up
  y = d - up;
  return y >= g + F && y >= 0 && y <= plan.H - 1 ? y : null;
}

// the new corners: the picture extended by the margins (along its own down direction) and moved by the mean difference
export function warpedCorners(im, plan) {
  const at = (px, py) => { const w = pxToWorld(im, px, py); return [w.x, w.y, w.z + plan.mean]; };
  return [at(0, -plan.upPx), at(plan.W, -plan.upPx), at(plan.W, plan.H + plan.downPx), at(0, plan.H + plan.downPx)];
}

// a synthetic or test resampler over a plain array (value per pixel, row-major) -> the warped array (W x newH, null where nothing maps)
export function warpArray(plan, src) {
  const out = new Array(plan.W * plan.newH).fill(null);
  for (let x = 0; x < plan.W; x++) for (let d = 0; d < plan.newH; d++) {
    const y = sourceRow(plan, x + 0.5, d);
    if (y != null) out[d * plan.W + x] = src[Math.min(plan.H - 1, Math.round(y)) * plan.W + x];
  }
  return out;
}
