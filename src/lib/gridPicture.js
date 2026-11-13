// TASKS.csv #3033 (split from #2838) — a value grid's picture, the part of rasterFromGrid (raster.js) that a filtered raster still froze the
// window with after the FFT moved to a worker: the 2nd-98th percentile stretch (a sort of every value), the viridis colours of every node
// and the stored values (float32 base64). Lean (no DOM, no geotiff) so the grid-filter worker can run it; rasterFromGrid uses it too, so the
// picture is the same either way. The PNG is made by the caller (a canvas here, an OffscreenCanvas in the worker).
import { percentileSorted } from "./arrayStats.js";
import { bytesToB64 } from "./base64.js";

// layers.js VIRIDIS_ANCHORS, copied so this module stays light (test/gridPicture3033 checks they are the same)
export const PICTURE_RAMP = [[68, 1, 84], [65, 68, 135], [42, 120, 142], [34, 168, 132], [122, 209, 81], [253, 231, 37]];
export function pictureColour(t) {
  const R = PICTURE_RAMP, n = R.length - 1;
  const seg = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  const localT = t * n - seg;
  const a = R[seg], b = R[seg + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * localT), Math.round(a[1] + (b[1] - a[1]) * localT), Math.round(a[2] + (b[2] - a[2]) * localT)];
}
// values (row 0 north), nx, ny -> { lo, hi (2nd / 98th percentile), valid, rgba: Uint8ClampedArray(nx * ny * 4), valuesB64 }
export function gridPicture(values, nx, ny) {
  let valid = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) valid++;
  if (!valid) return { lo: NaN, hi: NaN, valid: 0, rgba: null, valuesB64: null };
  const finite = new Float64Array(valid);
  for (let i = 0, k = 0; i < values.length; i++) if (Number.isFinite(values[i])) finite[k++] = values[i];
  finite.sort(); // the typed array's own numeric sort (it was a JS array and a comparator)
  const lo = percentileSorted(finite, 0.02), hi = percentileSorted(finite, 0.98); // #740 — makeStretch's rule
  const rgba = new Uint8ClampedArray(nx * ny * 4);
  for (let k = 0; k < nx * ny; k++) {
    const v = values[k];
    if (!Number.isFinite(v)) continue; // alpha 0
    const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
    const [r, g, b] = pictureColour(t);
    rgba[k * 4] = r; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = b; rgba[k * 4 + 3] = 255;
  }
  const f32 = Float32Array.from(values);
  return { lo, hi, valid, rgba, valuesB64: bytesToB64(new Uint8Array(f32.buffer)) };
}
