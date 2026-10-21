// TASKS.csv #237 (QGIS-specialist audit finding: "no raster derivatives (contours, hillshade)" from an
// imported DEM/terrain). Hillshade only, this pass — standard Horn (1981) method, the same central-
// difference slope/aspect algorithm GDAL's gdaldem/QGIS's own hillshade tool use, so the output should
// look/behave the way a geologist already expects from those tools. Contours (marching squares + line
// simplification) are a separate, larger piece of work, deliberately not attempted here.
//
// Works directly on the project's one terrain surface ({bbox, gridW, gridH, elevations} — store.jsx's
// shape, elevations row-major with row 0 = north, same convention this app's own bilinearSample/
// reproject.js already use) and produces a grayscale raster in the exact {name, bbox, dataUrl} shape
// every other raster source already produces, so it drops into the existing raster pipeline (drape-on-
// terrain, opacity) unchanged.
import { decodeNoDataMask, isNoData } from "./demFill.js";

// TASKS.csv #797 — a node is shown only when it and its 8 neighbours are real terrain: filled no-data (reprojection
// edges, failed tiles, #421) would otherwise draw false slopes / shading along those borders.
function edgeMask(noDataMask, gridW, gridH) {
  if (!noDataMask) return null;
  const m = decodeNoDataMask(noDataMask);
  const hide = new Uint8Array(gridW * gridH);
  for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = Math.max(0, Math.min(gridH - 1, r + dr)), cc = Math.max(0, Math.min(gridW - 1, c + dc));
      if (isNoData(m, rr * gridW + cc)) { hide[r * gridW + c] = 1; dr = 2; break; }
    }
  }
  return hide;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Returns a Float32Array of shading values in [0,1] (0 = fully shadowed, 1 = facing the sun directly),
// same size as the input grid. Edge cells (no full 3x3 neighborhood) reuse the nearest interior row/col
// — a standard, simple edge-handling choice (matches GDAL's default) rather than leaving a NaN border.
export function hillshadeValues(elevations, gridW, gridH, cellSizeX, cellSizeY, { azimuthDeg = 315, altitudeDeg = 45, zFactor = 1 } = {}) {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const zenith = Math.PI / 2 - alt;
  const out = new Float32Array(gridW * gridH);
  const at = (row, col) => {
    const r = Math.max(0, Math.min(gridH - 1, row));
    const c = Math.max(0, Math.min(gridW - 1, col));
    return elevations[r * gridW + c] * zFactor;
  };
  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      // row increases southward (row 0 = north), so a +1 row step is a move SOUTH — dz/dy below is
      // therefore (south - north) / (2*cellSizeY), the standard sign convention for this row order.
      const a = at(row - 1, col - 1), b = at(row - 1, col), c = at(row - 1, col + 1);
      const d = at(row, col - 1), f = at(row, col + 1);
      const g = at(row + 1, col - 1), h = at(row + 1, col), i = at(row + 1, col + 1);
      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSizeX);
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cellSizeY);
      const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      // Aspect = the compass direction the slope FACES (downhill), not the gradient's own (uphill)
      // direction — atan2(dzdx, dzdy) alone gives the uphill direction, so both components are negated
      // to point downhill instead. Measured clockwise from north, matching azimuthDeg's convention
      // (0=N, 90=E, ...). Caught via a synthetic tilted-plane test: an east-rising slope (faces west)
      // lit from the west came out fully dark before this fix, backwards from the physically-correct
      // fully-lit result.
      // TASKS.csv #797 — the north component of "downhill" is +dzdy, not -dzdy: rows run SOUTH, so dzdy is the change
      // per step south, and a surface falling to the south (dzdy < 0) faces south. With -dzdy, north- and south-facing
      // slopes swapped light: lit from the north, a north-facing slope came out dark (0.32) and a south-facing one
      // bright (0.95); the east-west case above was right, which is why the first fix's east-rising test passed.
      const aspect = Math.atan2(-dzdx, dzdy);
      const shade = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(az - aspect);
      out[row * gridW + col] = clamp01(shade);
    }
  }
  return out;
}

export function hillshadeToRasterInput({ bbox, gridW, gridH, elevations, noDataMask }, { azimuthDeg = 315, altitudeDeg = 45, zFactor = 1, name = "hillshade" } = {}) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const cellSizeX = (xmax - xmin) / Math.max(1, gridW - 1);
  const cellSizeY = (ymax - ymin) / Math.max(1, gridH - 1);
  const values = hillshadeValues(elevations, gridW, gridH, cellSizeX, cellSizeY, { azimuthDeg, altitudeDeg, zFactor });
  const hide = edgeMask(noDataMask, gridW, gridH);

  const canvas = document.createElement("canvas");
  canvas.width = gridW; canvas.height = gridH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(gridW, gridH);
  for (let i = 0; i < values.length; i++) {
    const g = Math.round(values[i] * 255);
    imgData.data[i * 4] = g; imgData.data[i * 4 + 1] = g; imgData.data[i * 4 + 2] = g; imgData.data[i * 4 + 3] = hide?.[i] ? 0 : 255; // #797
  }
  ctx.putImageData(imgData, 0, 0);
  return { name, bbox, dataUrl: canvas.toDataURL("image/png") };
}

// TASKS.csv #797 — terrain derivatives from the same 3x3 window (Horn gradients; Zevenbergen & Thorne curvature):
//  * multidirectional hillshade (GDAL -multidirectional, after Mark 1992): lit from 225, 270, 315 and 360 degrees,
//    each light weighted by sin^2(aspect - azimuth) so a slope is lit across its face - structures at every strike
//    show, where one sun hides those parallel to it (lineaments for structural targeting);
//  * slope (degrees), aspect (degrees clockwise from north, downhill; NaN where flat) and curvature (the Laplacian
//    term of Zevenbergen-Thorne, 1/100 m: positive = convex / ridges, negative = concave / hollows).
// Returns a Float32Array per node; edges reuse the nearest interior neighbourhood as hillshadeValues does.
export function terrainDerivativeValues(kind, elevations, gridW, gridH, cellSizeX, cellSizeY, { altitudeDeg = 45, zFactor = 1 } = {}) {
  const out = new Float32Array(gridW * gridH);
  const at = (row, col) => elevations[Math.max(0, Math.min(gridH - 1, row)) * gridW + Math.max(0, Math.min(gridW - 1, col))] * zFactor;
  const zenith = Math.PI / 2 - (altitudeDeg * Math.PI) / 180;
  const AZ = [225, 270, 315, 360].map((d) => (d * Math.PI) / 180);
  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      const a = at(row - 1, col - 1), b = at(row - 1, col), c = at(row - 1, col + 1);
      const d = at(row, col - 1), e = at(row, col), f = at(row, col + 1);
      const g = at(row + 1, col - 1), h = at(row + 1, col), i = at(row + 1, col + 1);
      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSizeX);
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cellSizeY);
      const grad = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
      const slope = Math.atan(grad), aspect = Math.atan2(-dzdx, dzdy); // downhill, clockwise from north (see hillshadeValues)
      let v;
      if (kind === "slope") v = (slope * 180) / Math.PI;
      else if (kind === "aspect") v = grad < 1e-6 ? NaN : (((aspect * 180) / Math.PI) + 360) % 360;
      else if (kind === "curvature") {
        const D = ((d + f) / 2 - e) / (cellSizeX * cellSizeX), E = ((b + h) / 2 - e) / (cellSizeY * cellSizeY);
        v = -2 * (D + E) * 100;
      } else { // multidirectional hillshade
        let s = 0, w = 0;
        for (const az of AZ) {
          const wt = Math.sin(aspect - az) ** 2;
          const shade = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(az - aspect);
          s += wt * clamp01(shade); w += wt;
        }
        v = w > 1e-9 ? s / w : clamp01(Math.cos(zenith)); // flat ground: every light is the same
      }
      out[row * gridW + col] = v;
    }
  }
  return out;
}

const pctl = (vals, p) => { const s = vals.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0; };
// The derivative as a drape-ready raster ({name, bbox, dataUrl} like hillshadeToRasterInput) plus the scale it was
// coloured on, so the import message can say what the colours mean.
export function terrainDerivativeToRasterInput({ bbox, gridW, gridH, elevations, noDataMask }, kind, { altitudeDeg = 45, zFactor = 1, name } = {}) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const cx = (xmax - xmin) / Math.max(1, gridW - 1), cy = (ymax - ymin) / Math.max(1, gridH - 1);
  const v = terrainDerivativeValues(kind, elevations, gridW, gridH, cx, cy, { altitudeDeg, zFactor });
  const canvas = document.createElement("canvas");
  canvas.width = gridW; canvas.height = gridH;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(gridW, gridH);
  let scale;
  const hide = edgeMask(noDataMask, gridW, gridH);
  const put = (k, r, g, b) => { img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = hide?.[k] ? 0 : 255; };
  if (kind === "slope") {
    const hi = Math.max(5, pctl(v, 0.98)); scale = { min: 0, max: hi };
    for (let k = 0; k < v.length; k++) { const t = 1 - Math.min(1, v[k] / hi); const gv = Math.round(40 + 215 * t); put(k, gv, gv, gv); } // steep = dark
  } else if (kind === "aspect") {
    scale = null;
    for (let k = 0; k < v.length; k++) {
      if (!Number.isFinite(v[k])) { put(k, 200, 200, 200); continue; } // flat
      const hh = v[k] / 60, x = 1 - Math.abs((hh % 2) - 1), seg = Math.floor(hh) % 6; // hue wheel: N red, E yellow-green, S cyan, W blue-magenta
      const [r, g, b] = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][seg];
      put(k, Math.round(60 + 170 * r), Math.round(60 + 170 * g), Math.round(60 + 170 * b));
    }
  } else if (kind === "curvature") {
    const m = Math.max(1e-6, pctl(v.map(Math.abs), 0.98)); scale = { min: -m, max: m };
    for (let k = 0; k < v.length; k++) { // concave blue - flat white - convex red
      const t = Math.max(-1, Math.min(1, v[k] / m));
      put(k, t > 0 ? 255 : Math.round(255 * (1 + t)), Math.round(255 * (1 - Math.abs(t))), t < 0 ? 255 : Math.round(255 * (1 - t)));
    }
  } else {
    scale = null;
    for (let k = 0; k < v.length; k++) { const gv = Math.round(clamp01(v[k]) * 255); put(k, gv, gv, gv); }
  }
  ctx.putImageData(img, 0, 0);
  return { name: name || `${kind}`, bbox, dataUrl: canvas.toDataURL("image/png"), scale };
}
