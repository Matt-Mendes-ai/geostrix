// TASKS.csv #235 (mineral-exploration-specialist audit finding) — "no way to grid an imported point
// cloud into a raster, despite the Python sidecar's /interpolate endpoint (RBF/IDW) being fully
// implemented and completely unreachable from any UI." Deliberately a lightweight pure-JS IDW gridder
// here INSTEAD of wiring up the existing sidecar endpoint for this specific feature: the sidecar isn't
// bundled into installers yet (#49 still Planned), so a sidecar-only feature would be invisible to
// GeoStrix's actual target audience (budget-constrained geologists on a plain install — see the
// project's standing performance-priority memory) until #49 ships. IDW (inverse-distance weighting) is
// the simpler, more robust of the two methods anyway for a first pass — no matrix solve, no risk of the
// numerical instability RBF can hit with clustered points, "good enough" quality for a quick-look grid
// of geophysics/geochem point data, which is exactly what this is for.
import { magColorRGB } from "./layers.js";

// Grids `points` ({x,y,value}[]) onto a regular raster using inverse-distance weighting. `power`
// controls how sharply influence falls off with distance (2 is the standard IDW default); each cell uses
// its `maxPoints` nearest points (ties broken as before), limited to `maxDistance` when one is given. A
// cell farther than `maxDistance` from every point gets NaN (rendered transparent) rather than being
// extrapolated.
//
// TASKS.csv #370 — exact k-nearest search over a bucket grid instead of comparing every cell with every
// point (and, with maxDistance = Infinity, collecting and sorting ALL points per cell). Measured before:
// 5,000 points on 100x100 = 31 s and 20,000 points on 200x200 = 397 s of frozen UI — a normal 5 km survey
// at 25 m cells. The ring search visits buckets outward from the cell and stops once the next ring is
// farther than the current k-th nearest point, so the result is the same set of points the brute-force
// scan chose.
export function idwGrid(points, { xmin, ymin, xmax, ymax, cellSize, power = 2, maxDistance = Infinity, maxPoints = 12 }) {
  const gridW = Math.max(1, Math.round((xmax - xmin) / cellSize));
  const gridH = Math.max(1, Math.round((ymax - ymin) / cellSize));
  const values = new Float32Array(gridW * gridH);
  const EPS = 1e-9;
  const n = points.length;
  if (!n) { values.fill(NaN); return { gridW, gridH, values }; }

  // Bucket grid over the points: ~2 points per bucket on average.
  let pxmin = Infinity, pymin = Infinity, pxmax = -Infinity, pymax = -Infinity;
  for (let i = 0; i < n; i++) { const p = points[i]; if (p.x < pxmin) pxmin = p.x; if (p.x > pxmax) pxmax = p.x; if (p.y < pymin) pymin = p.y; if (p.y > pymax) pymax = p.y; }
  const span = Math.max(pxmax - pxmin, pymax - pymin, 1e-6);
  const bs = Math.max(span / Math.max(1, Math.ceil(Math.sqrt(n / 2))), 1e-6);
  const bw = Math.max(1, Math.ceil((pxmax - pxmin) / bs) + 1), bh = Math.max(1, Math.ceil((pymax - pymin) / bs) + 1);
  const counts = new Int32Array(bw * bh + 1);
  const bx = new Int32Array(n), by = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    bx[i] = Math.min(bw - 1, Math.floor((points[i].x - pxmin) / bs));
    by[i] = Math.min(bh - 1, Math.floor((points[i].y - pymin) / bs));
    counts[by[i] * bw + bx[i] + 1]++;
  }
  for (let i = 1; i <= bw * bh; i++) counts[i] += counts[i - 1];
  const order = new Int32Array(n);
  const fill = counts.slice(0, bw * bh);
  for (let i = 0; i < n; i++) order[fill[by[i] * bw + bx[i]]++] = i; // stable: preserves input order within a bucket

  const k = Math.max(1, maxPoints);
  const bestD = new Float64Array(k), bestI = new Int32Array(k);
  for (let row = 0; row < gridH; row++) {
    const cy = ymax - (row + 0.5) * cellSize; // row 0 = north, same convention as reproject.js/raster.js
    for (let col = 0; col < gridW; col++) {
      const cx = xmin + (col + 0.5) * cellSize;
      const cbx = Math.floor((cx - pxmin) / bs), cby = Math.floor((cy - pymin) / bs);
      let found = 0, exact = -1;
      const consider = (i) => {
        const dx = points[i].x - cx, dy = points[i].y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= EPS) { if (exact < 0 || i < exact) exact = i; return; }
        const d = Math.sqrt(d2);
        if (d > maxDistance) return;
        // insertion into the sorted top-k; ties keep the earlier input index first (as the stable sort did)
        let pos = found < k ? found : k;
        while (pos > 0 && (bestD[pos - 1] > d || (bestD[pos - 1] === d && bestI[pos - 1] > i))) pos--;
        if (pos >= k) return;
        const last = Math.min(found, k - 1);
        for (let j = last; j > pos; j--) { bestD[j] = bestD[j - 1]; bestI[j] = bestI[j - 1]; }
        bestD[pos] = d; bestI[pos] = i;
        if (found < k) found++;
      };
      const visit = (gx, gy) => {
        if (gx < 0 || gy < 0 || gx >= bw || gy >= bh) return;
        const b = gy * bw + gx;
        for (let q = counts[b]; q < counts[b + 1]; q++) consider(order[q]);
      };
      const maxRing = Math.max(bw, bh) + Math.max(Math.abs(cbx), Math.abs(cby)) + 2;
      for (let r = 0; r <= maxRing; r++) {
        // nearest possible distance of anything in ring r
        const ringMin = Math.max(0, (r - 1) * bs);
        if (ringMin > maxDistance) break;
        if (found >= k && ringMin > bestD[k - 1]) break;
        if (r === 0) visit(cbx, cby);
        else {
          for (let gx = cbx - r; gx <= cbx + r; gx++) { visit(gx, cby - r); visit(gx, cby + r); }
          for (let gy = cby - r + 1; gy <= cby + r - 1; gy++) { visit(cbx - r, gy); visit(cbx + r, gy); }
        }
      }
      if (exact >= 0) { values[row * gridW + col] = points[exact].value; continue; } // sitting exactly on a sample
      if (!found) { values[row * gridW + col] = NaN; continue; }
      let wSum = 0, vSum = 0;
      for (let j = 0; j < found; j++) {
        const w = 1 / Math.pow(bestD[j], power);
        wSum += w; vSum += w * points[bestI[j]].value;
      }
      values[row * gridW + col] = vSum / wSum;
    }
  }
  return { gridW, gridH, values };
}

// Renders an idwGrid() result straight to a raster-shaped {name, bbox, dataUrl} — the exact shape
// RasterModule's addRaster() already accepts from every other raster source (GeoTIFF, .gxf, the
// georeferencer), so a gridded point layer drops into the existing raster pipeline (drape-on-terrain,
// opacity, removal, etc.) with no new rendering code needed downstream. Colour-mapped the same way
// raster.js's own single-band GeoTIFF import already is (magColorRGB, NaN cells fully transparent so
// gaps show whatever's underneath rather than a false-color block).
export function idwGridToRasterInput(points, { xmin, ymin, xmax, ymax, cellSize, power, name }) {
  const { gridW, gridH, values } = idwGrid(points, { xmin, ymin, xmax, ymax, cellSize, power });
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) { const v = values[i]; if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; } }
  const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;

  const canvas = document.createElement("canvas");
  canvas.width = gridW; canvas.height = gridH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(gridW, gridH);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { imgData.data[i * 4 + 3] = 0; continue; }
    const [r, g, b] = magColorRGB(v, hasRange ? min : v - 1, hasRange ? max : v + 1);
    imgData.data[i * 4] = r; imgData.data[i * 4 + 1] = g; imgData.data[i * 4 + 2] = b; imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // TASKS.csv #370 — the raster covers exactly the whole cells that were gridded (cell centres are placed
  // from xmin / ymax at cellSize steps). It used to be stretched over the raw data extent, so e.g. 130 m of
  // data at 25 m cells (5 cells = 125 m) was drawn 4% too large and shifted.
  return { name, bbox: [xmin, ymax - gridH * cellSize, xmin + gridW * cellSize, ymax], dataUrl: canvas.toDataURL("image/png"), gridMin: hasRange ? min : null, gridMax: hasRange ? max : null };
}
