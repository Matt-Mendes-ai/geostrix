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
// controls how sharply influence falls off with distance (2 is the standard IDW default). `maxPoints`
// caps how many of the nearest points feed each cell — full O(cells * points) with no spatial index is
// fine at the point/cell counts this tool is meant for (a few thousand points, a few hundred cells per
// side); a proper k-d tree would only start to matter at a scale beyond what a quick-look grid needs.
// A cell farther than `maxDistance` from every point gets NaN (rendered transparent, not a wild
// extrapolation) rather than being IDW'd from points that aren't actually nearby.
export function idwGrid(points, { xmin, ymin, xmax, ymax, cellSize, power = 2, maxDistance = Infinity, maxPoints = 12 }) {
  const gridW = Math.max(1, Math.round((xmax - xmin) / cellSize));
  const gridH = Math.max(1, Math.round((ymax - ymin) / cellSize));
  const values = new Float32Array(gridW * gridH);
  const EPS = 1e-9;

  for (let row = 0; row < gridH; row++) {
    const cy = ymax - (row + 0.5) * cellSize; // row 0 = north, same convention as reproject.js/raster.js
    for (let col = 0; col < gridW; col++) {
      const cx = xmin + (col + 0.5) * cellSize;
      // nearest `maxPoints` points within maxDistance, by squared distance (avoids a sqrt per point
      // for the ones that get discarded before the final weighting pass).
      let candidates = [];
      for (const p of points) {
        const dx = p.x - cx, dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= EPS) { candidates = [{ d: 0, value: p.value }]; break; } // sitting exactly on a sample — use it exactly, skip weighting
        const d = Math.sqrt(d2);
        if (d <= maxDistance) candidates.push({ d, value: p.value });
      }
      if (!candidates.length) { values[row * gridW + col] = NaN; continue; }
      candidates.sort((a, b) => a.d - b.d);
      if (candidates.length > maxPoints) candidates = candidates.slice(0, maxPoints);
      if (candidates[0].d === 0) { values[row * gridW + col] = candidates[0].value; continue; }
      let wSum = 0, vSum = 0;
      for (const c of candidates) {
        const w = 1 / Math.pow(c.d, power);
        wSum += w; vSum += w * c.value;
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

  return { name, bbox: [xmin, ymin, xmax, ymax], dataUrl: canvas.toDataURL("image/png"), gridMin: hasRange ? min : null, gridMax: hasRange ? max : null };
}
