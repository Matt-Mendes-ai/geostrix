// TASKS.csv #129 — QGIS-specialist audit finding: "Raster/GeoTIFF import trusts embedded tags;
// there's no way to georeference an ungeoreferenced scanned map (old assessment-report maps, scanned
// claim sketches — a common field/legacy-data need) the way QGIS's Georeferencer does with manual
// control points." This is that manual tie-point tool's math core: fit a 2D affine transform from
// pixel space to world space given >=3 user-placed control points, then resample the source image
// into an axis-aligned world-space raster — same "forward-project corners for a bbox, then
// inverse-sample per output pixel" pattern already used by reprojectGrid (reproject.js) and
// satelliteFetch.js's tile mosaic reprojection, just with an affine fit standing in for a proj4
// definition as the pixel<->world mapping.
//
// A full 6-parameter affine (independent scale/rotation/shear per axis) needs >=3 non-collinear
// points to solve via least squares — fewer than that (a simpler similarity transform from exactly 2
// points) isn't supported; 3 is also QGIS's own practical minimum for anything beyond a pure
// scale+translate fit, so this isn't a meaningfully higher bar than the tool it's modeled on.

function solve3x3(A, b) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-9) {
    throw new Error("Control points are degenerate (collinear, or duplicated pixel locations) — a transform can't be solved. Use at least 3 points that aren't all on one line.");
  }
  const replaceCol = (m, col, vec) => m.map((row, i) => row.map((v, j) => (j === col ? vec[i] : v)));
  return [0, 1, 2].map((col) => det(replaceCol(A, col, b)) / D);
}

function fitLinear3(rows, target) {
  const ATA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const ATb = [0, 0, 0];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], t = target[i];
    for (let a = 0; a < 3; a++) {
      ATb[a] += r[a] * t;
      for (let b = 0; b < 3; b++) ATA[a][b] += r[a] * r[b];
    }
  }
  return solve3x3(ATA, ATb);
}

// points: [{px, py, x, y}, ...] — px/py in source-image pixel space (y grows downward, matching
// canvas/image convention), x/y in world/project coordinates. Returns { a,b,c,d,e,f } for
// x = a*px + b*py + c, y = d*px + e*py + f.
export function fitAffine(points) {
  if (points.length < 3) throw new Error("Need at least 3 control points to fit a georeferencing transform.");
  const rows = points.map((p) => [p.px, p.py, 1]);
  const [a, b, c] = fitLinear3(rows, points.map((p) => p.x));
  const [d, e, f] = fitLinear3(rows, points.map((p) => p.y));
  return { a, b, c, d, e, f };
}

export function forwardMap(t, px, py) {
  return { x: t.a * px + t.b * py + t.c, y: t.d * px + t.e * py + t.f };
}

// Inverse of the affine's linear part, for mapping world coords back to source-pixel coords (needed
// to sample the source image per output cell — see georeferenceImage below).
function invertLinear(t) {
  const det = t.a * t.e - t.b * t.d;
  if (Math.abs(det) < 1e-12) throw new Error("This set of control points defines a degenerate (zero-area) transform — can't invert it to resample the image.");
  return { ia: t.e / det, ib: -t.b / det, id: -t.d / det, ie: t.a / det };
}

// Per-point residual (world-space distance between where the fitted transform actually places a
// control point's pixel, and where the user said that point should be) — the standard "how good is
// this fit" signal any georeferencer shows, since a single mis-typed coordinate or misclicked pixel
// can silently distort the whole transform otherwise.
export function residuals(t, points) {
  return points.map((p) => {
    const mapped = forwardMap(t, p.px, p.py);
    return { ...p, dx: mapped.x - p.x, dy: mapped.y - p.y, error: Math.hypot(mapped.x - p.x, mapped.y - p.y) };
  });
}

const OUT_GRID_MAX = 1024; // matches satelliteFetch.js's GRID_MAX — a scanned map benefits from staying sharp

// Resamples `imageData` (a canvas ImageData from the source scan, full pixel resolution) into a new
// axis-aligned world-space raster using the fitted affine — the same "forward-project the source's
// corners to get a covering bbox, then inverse-map + bilinear-sample each output pixel" shape
// reprojectGrid/satelliteFetch.js already use, just with an affine instead of a proj4 CRS pair. This
// is what makes a ROTATED scan (a common real case — a scanned map is rarely perfectly axis-aligned
// to the project's own grid) still come out as a correctly axis-aligned raster, not just pasted in
// unrotated at the wrong angle, matching every other raster this app already renders as a plain
// rectangle.
export function georeferenceImage(imageData, srcWidth, srcHeight, transform) {
  const corners = [[0, 0], [srcWidth, 0], [srcWidth, srcHeight], [0, srcHeight]].map(([px, py]) => forwardMap(transform, px, py));
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const aspect = (xmax - xmin) / Math.max(1e-9, ymax - ymin);
  const outW = aspect >= 1 ? OUT_GRID_MAX : Math.max(2, Math.round(OUT_GRID_MAX * aspect));
  const outH = aspect >= 1 ? Math.max(2, Math.round(OUT_GRID_MAX / aspect)) : OUT_GRID_MAX;

  const inv = invertLinear(transform);
  const src = imageData.data;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let row = 0; row < outH; row++) {
    const y = ymax - (row / Math.max(1, outH - 1)) * (ymax - ymin); // row 0 = north, matching every other raster/grid in this app
    for (let col = 0; col < outW; col++) {
      const x = xmin + (col / Math.max(1, outW - 1)) * (xmax - xmin);
      const px = inv.ia * (x - transform.c) + inv.ib * (y - transform.f);
      const py = inv.id * (x - transform.c) + inv.ie * (y - transform.f);
      const outIdx = (row * outW + col) * 4;
      if (px < 0 || px > srcWidth - 1 || py < 0 || py > srcHeight - 1) continue; // outside the source scan — leave transparent
      // Bilinear sample directly on the RGBA source (four separate channel lookups, not the
      // single-band bilinearSample in reproject.js — that one's shaped for a scalar elevation/color
      // band, not an interleaved RGBA pixel buffer).
      const x0 = Math.max(0, Math.min(srcWidth - 2, Math.floor(px))), x1 = x0 + 1;
      const y0 = Math.max(0, Math.min(srcHeight - 2, Math.floor(py))), y1 = y0 + 1;
      const tx = px - x0, ty = py - y0;
      for (let ch = 0; ch < 4; ch++) {
        const v00 = src[(y0 * srcWidth + x0) * 4 + ch], v10 = src[(y0 * srcWidth + x1) * 4 + ch];
        const v01 = src[(y1 * srcWidth + x0) * 4 + ch], v11 = src[(y1 * srcWidth + x1) * 4 + ch];
        const top = v00 + (v10 - v00) * tx, bot = v01 + (v11 - v01) * tx;
        out[outIdx + ch] = top + (bot - top) * ty;
      }
    }
  }
  return { bbox: [xmin, ymin, xmax, ymax], outW, outH, data: out };
}
