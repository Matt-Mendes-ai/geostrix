// TASKS.csv #421 — DEM cells with no data. After reprojection a DEM's footprint is a rotated/curved
// quadrilateral inside an axis-aligned grid, so its corners are empty wedges (measured 2.5-11.6% of cells
// for single tiles around -127..-133 longitude). Those cells used to be filled with the mean elevation
// silently, which drew them as flat plateaus in 3D and let collars, sections and inversion stations sample
// an invented height there.
//
// The fill is kept for SAMPLING (a NaN inside the grid would poison bilinear lookups, bounding boxes and
// the inversion), but now: the filled cells are recorded in a bitset (`noDataMask`, base64, persisted
// with the terrain) so the 3D mesh leaves them out, and the importer says how many cells were filled
// and with what value.

export function fillNoData(values) {
  const n = values.length;
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(values[i])) { sum += values[i]; count++; }
  const fallback = count ? sum / count : 0;
  const bits = new Uint8Array(Math.ceil(n / 8));
  const elevations = new Array(n);
  let filled = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(values[i])) elevations[i] = values[i];
    else { elevations[i] = fallback; bits[i >> 3] |= 1 << (i & 7); filled++; }
  }
  return { elevations, filledCount: filled, filledPct: n ? (100 * filled) / n : 0, fillValue: fallback, noDataMask: filled ? bytesToB64(bits) : null };
}

export function decodeNoDataMask(b64) {
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function isNoData(maskBytes, i) {
  return !!maskBytes && (maskBytes[i >> 3] & (1 << (i & 7))) !== 0;
}

// Human-readable line for the import message.
export function noDataNote(fill) {
  if (!fill.filledCount) return "";
  return ` ${fill.filledPct.toFixed(1)}% of the grid (${fill.filledCount.toLocaleString()} cells) has no source data — usually the empty corners left by reprojection, or tiles that failed to download. Those cells are left out of the 3D surface; anything that samples elevation there (collars, sections, geophysics stations) gets the mean elevation ${fill.fillValue.toFixed(0)} m, not a real height.`;
}

function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
