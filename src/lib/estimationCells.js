// TASKS.csv #661 — a block model's cells as typed COLUMNS, the form the estimation worker hands back. Building one
// object per block in the worker and then structured-cloning them to the window cost 243-295 bytes per block in EACH
// (worker and renderer) plus ~5 s of cloning per million blocks; the columns are ~53 bytes per block and are
// transferred, not copied. The window then builds the cell objects the rest of the app reads, once. No imports, so
// the window does not load the estimator to read a result.
export const SUPPORT_BY_CODE = ["unsupported", "extrapolated", "interpolated"]; // estimation.js SUPPORT_CODES, inverted

// cols: { n, dx, dy, dz, x, y, z, value (Float64Array), nSamples, nHoles (Uint16Array),
//         support? (Uint8Array codes), supportIndex?, nearestSampleM? (Float64Array) }
export function cellsFromColumns(cols) {
  const cells = new Array(cols.n);
  fillCells(cells, cols, 0, cols.n);
  return cells;
}
// TASKS.csv #3060 — the same cells, built in slices of `slice` blocks with a yield between them, so a whole-field result (627,000 blocks:
// 0.5 s in one task) does not freeze the window. `signal` aborted: rejects with .cancelled, like runEstimation.
export async function cellsFromColumnsSliced(cols, { slice = 40000, signal = null, pause = () => new Promise((r) => setTimeout(r, 0)) } = {}) {
  const cells = new Array(cols.n);
  for (let a = 0; a < cols.n; a += slice) {
    if (signal?.aborted) throw Object.assign(new Error("Cancelled."), { cancelled: true });
    fillCells(cells, cols, a, Math.min(cols.n, a + slice));
    if (a + slice < cols.n) await pause();
  }
  return cells;
}
function fillCells(cells, cols, from, to) {
  const { dx, dy, dz, x, y, z, value, nSamples, nHoles, support, supportIndex, nearestSampleM, kv, holeShare, beyond, nearUnsampled, fromLog } = cols; // beyond: #2417; nearUnsampled: #2596; fromLog: #2721 // kv: #709 kriging variance; holeShare: #1617
  for (let i = from; i < to; i++) {
    const c = { x: x[i], y: y[i], z: z[i], dx, dy, dz, value: value[i], nSamples: nSamples[i], nHoles: nHoles[i] };
    if (kv && Number.isFinite(kv[i])) c.kv = kv[i];
    if (beyond && beyond[i]) c.beyond = beyond[i] === 1 ? "above" : "below"; // #2417 — above / below every sample informing it
    if (nearUnsampled && nearUnsampled[i]) c.nearUnsampled = true; // #2596 — its nearest drilled metre has no sample
    if (fromLog && fromLog[i] > 0) c.fromLog = fromLog[i]; // #2721 — the share of its value from a picked log's readings
    if (holeShare && Number.isFinite(holeShare[i])) c.holeShare = holeShare[i]; // #1617 — the dominant hole's share of the weight
    if (support && support[i] !== 255) { c.support = SUPPORT_BY_CODE[support[i]]; c.supportIndex = supportIndex[i]; c.nearestSampleM = nearestSampleM[i]; }
    cells[i] = c;
  }
}
// TASKS.csv #3060 — the nearest-neighbour check model kept as its lattice and values only (x, y, z, value: ~32 bytes a block), never as cell
// objects (lib/estimateCheck.js joins it as columns): on a whole-field run that was a second 627,000-object build and ~0.25 GB held
export const checkColumns = (cols) => ({ n: cols.n, dx: cols.dx, dy: cols.dy, dz: cols.dz, x: cols.x, y: cols.y, z: cols.z, value: cols.value });

// the buffers to transfer from the worker
export const columnBuffers = (cols) => [cols.x, cols.y, cols.z, cols.value, cols.nSamples, cols.nHoles, cols.support, cols.supportIndex, cols.nearestSampleM, cols.kv, cols.holeShare, cols.beyond, cols.nearUnsampled, cols.fromLog].filter(Boolean).map((a) => a.buffer);
