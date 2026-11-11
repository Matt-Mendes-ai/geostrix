// TASKS.csv #661 — a block model's cells as typed COLUMNS, the form the estimation worker hands back. Building one
// object per block in the worker and then structured-cloning them to the window cost 243-295 bytes per block in EACH
// (worker and renderer) plus ~5 s of cloning per million blocks; the columns are ~53 bytes per block and are
// transferred, not copied. The window then builds the cell objects the rest of the app reads, once. No imports, so
// the window does not load the estimator to read a result.
export const SUPPORT_BY_CODE = ["unsupported", "extrapolated", "interpolated"]; // estimation.js SUPPORT_CODES, inverted

// cols: { n, dx, dy, dz, x, y, z, value (Float64Array), nSamples, nHoles (Uint16Array),
//         support? (Uint8Array codes), supportIndex?, nearestSampleM? (Float64Array) }
export function cellsFromColumns(cols) {
  const { n, dx, dy, dz, x, y, z, value, nSamples, nHoles, support, supportIndex, nearestSampleM, kv, holeShare, beyond, nearUnsampled } = cols; // beyond: #2417; nearUnsampled: #2596 // kv: #709 kriging variance; holeShare: #1617
  const cells = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = { x: x[i], y: y[i], z: z[i], dx, dy, dz, value: value[i], nSamples: nSamples[i], nHoles: nHoles[i] };
    if (kv && Number.isFinite(kv[i])) c.kv = kv[i];
    if (beyond && beyond[i]) c.beyond = beyond[i] === 1 ? "above" : "below"; // #2417 — above / below every sample informing it
    if (nearUnsampled && nearUnsampled[i]) c.nearUnsampled = true; // #2596 — its nearest drilled metre has no sample
    if (holeShare && Number.isFinite(holeShare[i])) c.holeShare = holeShare[i]; // #1617 — the dominant hole's share of the weight
    if (support && support[i] !== 255) { c.support = SUPPORT_BY_CODE[support[i]]; c.supportIndex = supportIndex[i]; c.nearestSampleM = nearestSampleM[i]; }
    cells[i] = c;
  }
  return cells;
}

// the buffers to transfer from the worker
export const columnBuffers = (cols) => [cols.x, cols.y, cols.z, cols.value, cols.nSamples, cols.nHoles, cols.support, cols.supportIndex, cols.nearestSampleM, cols.kv, cols.holeShare, cols.beyond, cols.nearUnsampled].filter(Boolean).map((a) => a.buffer);
