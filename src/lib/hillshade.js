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
      const aspect = Math.atan2(-dzdx, -dzdy);
      const shade = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(az - aspect);
      out[row * gridW + col] = clamp01(shade);
    }
  }
  return out;
}

export function hillshadeToRasterInput({ bbox, gridW, gridH, elevations }, { azimuthDeg = 315, altitudeDeg = 45, zFactor = 1, name = "hillshade" } = {}) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const cellSizeX = (xmax - xmin) / Math.max(1, gridW - 1);
  const cellSizeY = (ymax - ymin) / Math.max(1, gridH - 1);
  const values = hillshadeValues(elevations, gridW, gridH, cellSizeX, cellSizeY, { azimuthDeg, altitudeDeg, zFactor });

  const canvas = document.createElement("canvas");
  canvas.width = gridW; canvas.height = gridH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(gridW, gridH);
  for (let i = 0; i < values.length; i++) {
    const g = Math.round(values[i] * 255);
    imgData.data[i * 4] = g; imgData.data[i * 4 + 1] = g; imgData.data[i * 4 + 2] = g; imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return { name, bbox, dataUrl: canvas.toDataURL("image/png") };
}
