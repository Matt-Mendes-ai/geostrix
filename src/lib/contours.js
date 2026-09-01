// TASKS.csv #237 sub-item (2) — contour generation from the imported DEM/terrain surface. The
// QGIS-specialist audit's original finding was "no raster derivatives (contours, hillshade)";
// hillshade landed first (see hillshade.js, which explicitly deferred this half as "marching squares
// + line simplification, a separate, larger piece of work").
//
// Works on the same terrain shape everything else in this app does ({bbox, gridW, gridH, elevations},
// row-major, row 0 = north — see hillshade.js/reproject.js for that convention) and emits WORLD-space
// polylines in the exact {name, polylines: [[{x,y}]]} shape `boundaries` already uses (store.jsx's
// addBoundary), so contours drop straight into the existing boundary render path — including its
// drapeMode, colour and per-line elevation support — rather than needing a new layer type. That also
// means contours are exportable/stylable with the same controls a geologist already knows here.
//
// ALGORITHM: marching squares. For each contour level, each grid cell (a 2x2 block of samples) is
// classified by which of its four corners are above the level; that gives 16 possible cases, each
// with a known set of line segments crossing the cell. Segment endpoints are placed by LINEAR
// INTERPOLATION along the cell edge they cross (not at the edge midpoint) — that's what makes the
// output follow the surface smoothly instead of looking blocky/stair-stepped.
//
// The two genuinely tricky parts, both handled explicitly below:
//  1. SADDLE CASES (5 and 10) — a cell where two diagonally-opposite corners are above the level is
//     ambiguous: the two contour strands can connect two different ways, and picking wrong produces
//     visibly crossed/incorrect contours. Resolved by comparing the cell-centre average against the
//     level (the standard, cheap disambiguation), rather than picking arbitrarily.
//  2. STITCHING — marching squares emits a soup of unordered, disconnected 2-point segments. Drawn
//     raw that way, every contour is thousands of separate line fragments. They're joined here into
//     long polylines by matching shared endpoints, which is what makes the result usable (and is
//     what makes closed contours actually close).

// Quantized key for endpoint matching during stitching. Floating-point endpoints computed from two
// different cells that SHOULD be identical can differ in the last bits, so exact === matching would
// fail to join them and leave the contour fragmented. Quantizing to ~1e-6 of a grid cell is far finer
// than any real DEM's precision while still being coarse enough to absorb that drift.
function keyOf(p, eps) {
  return `${Math.round(p.x / eps)}|${Math.round(p.y / eps)}`;
}

// Linear interpolation of the crossing point along an edge between two samples.
function interp(x1, y1, v1, x2, y2, v2, level) {
  const denom = v2 - v1;
  // Guard: two equal corner values mean the edge lies exactly along the level; midpoint is the
  // standard degenerate-case answer and avoids a divide-by-zero producing NaN coordinates.
  const t = Math.abs(denom) < 1e-12 ? 0.5 : (level - v1) / denom;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: x1 + (x2 - x1) * tc, y: y1 + (y2 - y1) * tc };
}

// Returns an array of polylines ([{x,y}, ...]) tracing `level` across the grid, in world coords.
export function contourLevel({ bbox, gridW, gridH, elevations }, level) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const dx = (xmax - xmin) / Math.max(1, gridW - 1);
  const dy = (ymax - ymin) / Math.max(1, gridH - 1);
  // row 0 = north (ymax) — same convention as hillshade.js/bilinearSample.
  const wx = (col) => xmin + col * dx;
  const wy = (row) => ymax - row * dy;
  const at = (row, col) => elevations[row * gridW + col];

  const segments = [];
  for (let row = 0; row < gridH - 1; row++) {
    for (let col = 0; col < gridW - 1; col++) {
      // Corners, going clockwise from top-left, with their world positions.
      const vTL = at(row, col), vTR = at(row, col + 1), vBR = at(row + 1, col + 1), vBL = at(row + 1, col);
      if (!Number.isFinite(vTL) || !Number.isFinite(vTR) || !Number.isFinite(vBR) || !Number.isFinite(vBL)) continue;
      const xL = wx(col), xR = wx(col + 1), yT = wy(row), yB = wy(row + 1);

      let idx = 0;
      if (vTL >= level) idx |= 8;
      if (vTR >= level) idx |= 4;
      if (vBR >= level) idx |= 2;
      if (vBL >= level) idx |= 1;
      if (idx === 0 || idx === 15) continue; // wholly above or wholly below — no crossing

      // Crossing points on each of the four edges (only the ones this case needs get used).
      const top = () => interp(xL, yT, vTL, xR, yT, vTR, level);
      const right = () => interp(xR, yT, vTR, xR, yB, vBR, level);
      const bottom = () => interp(xL, yB, vBL, xR, yB, vBR, level);
      const left = () => interp(xL, yT, vTL, xL, yB, vBL, level);

      // Degenerate (zero-length) segments are dropped rather than pushed. They arise whenever a grid
      // NODE sits exactly on the contour level — both of a cell's crossing points then collapse onto
      // that same node. This is not a synthetic-only edge case: integer-metre DEMs (SRTM) hit exact
      // equality with a round contour level routinely. Caught by a synthetic cone test, where the
      // Pythagorean lattice points at exactly the contour radius ((25,50), (43,74), (35,70), ...) each
      // emitted a zero-length "line", turning one clean 191-point closed ring into 13 fragments.
      const degenTol = Math.min(Math.abs(dx), Math.abs(dy)) * 1e-9;
      const push = (a, b) => { if (Math.hypot(a.x - b.x, a.y - b.y) > degenTol) segments.push([a, b]); };

      switch (idx) {
        case 1: case 14: push(left(), bottom()); break;
        case 2: case 13: push(bottom(), right()); break;
        case 3: case 12: push(left(), right()); break;
        case 4: case 11: push(top(), right()); break;
        case 6: case 9:  push(top(), bottom()); break;
        case 7: case 8:  push(left(), top()); break;
        // Saddles — see this file's header comment. The cell-centre average decides which of the two
        // valid pairings is correct; picking arbitrarily here is what produces visibly crossed contours.
        case 5: {
          const centre = (vTL + vTR + vBR + vBL) / 4;
          if (centre >= level) { push(left(), top()); push(bottom(), right()); }
          else { push(left(), bottom()); push(top(), right()); }
          break;
        }
        case 10: {
          const centre = (vTL + vTR + vBR + vBL) / 4;
          if (centre >= level) { push(left(), bottom()); push(top(), right()); }
          else { push(left(), top()); push(bottom(), right()); }
          break;
        }
        default: break;
      }
    }
  }
  if (!segments.length) return [];

  // ---- stitch segments into polylines ----
  // Segments come out of the case table above in whatever orientation that case happened to define,
  // NOT consistently head-to-tail along the contour. An earlier version of this indexed only each
  // segment's START point, so any neighbour that happened to be stored in the opposite orientation
  // never matched and the chain broke there — a synthetic cone test caught it emitting 35 fragments
  // for what should have been ONE closed ring (the geometry was right, the connectivity wasn't).
  // Fixed by indexing BOTH endpoints and reversing a segment when it's the far end that matches, then
  // also walking backward from the head so an open contour started from its middle still comes out as
  // one line rather than two.
  const eps = Math.min(Math.abs(dx), Math.abs(dy)) * 1e-6 || 1e-9;
  const touching = new Map(); // endpoint key -> segment indices touching it (either end)
  const addTouch = (k, i) => { if (!touching.has(k)) touching.set(k, []); touching.get(k).push(i); };
  segments.forEach((seg, i) => { addTouch(keyOf(seg[0], eps), i); addTouch(keyOf(seg[1], eps), i); });

  const used = new Array(segments.length).fill(false);
  // Finds an unused segment touching `pt` and returns its OTHER endpoint (so the caller can just
  // append it), or null when the chain ends here.
  const stepFrom = (pt) => {
    const k = keyOf(pt, eps);
    const cands = touching.get(k);
    if (!cands) return null;
    for (const j of cands) {
      if (used[j]) continue;
      used[j] = true;
      const [a, b] = segments[j];
      return keyOf(a, eps) === k ? b : a; // reverse the segment when it's `b` that matched
    }
    return null;
  };

  const lines = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const line = [segments[i][0], segments[i][1]];
    // forward from the tail
    for (let guard = 0; guard < segments.length; guard++) {
      const next = stepFrom(line[line.length - 1]);
      if (!next) break;
      line.push(next);
      if (keyOf(next, eps) === keyOf(line[0], eps)) break; // closed ring — stop, don't loop forever
    }
    // backward from the head (skipped once the ring already closed)
    if (keyOf(line[line.length - 1], eps) !== keyOf(line[0], eps)) {
      for (let guard = 0; guard < segments.length; guard++) {
        const prev = stepFrom(line[0]);
        if (!prev) break;
        line.unshift(prev);
        if (keyOf(prev, eps) === keyOf(line[line.length - 1], eps)) break;
      }
    }
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

// Convenience: contour a terrain at a fixed interval, returning one boundary-shaped object per level.
// `interval` is in the terrain's own elevation units (metres for every DEM this app imports).
// maxLines guards against a user typing an absurdly small interval on a large DEM and locking the UI
// up building millions of segments — it stops early and reports how many levels actually ran, rather
// than silently truncating with no explanation.
export function contourTerrain(terrain, { interval = 50, maxLevels = 200 } = {}) {
  const { elevations } = terrain;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { levels: [], min, max, truncated: false };
  if (!(interval > 0)) return { levels: [], min, max, truncated: false };

  const first = Math.ceil(min / interval) * interval;
  const levels = [];
  let truncated = false;
  for (let lv = first; lv <= max; lv += interval) {
    if (levels.length >= maxLevels) { truncated = true; break; }
    const polylines = contourLevel(terrain, lv);
    if (polylines.length) levels.push({ level: lv, polylines });
  }
  return { levels, min, max, truncated };
}
