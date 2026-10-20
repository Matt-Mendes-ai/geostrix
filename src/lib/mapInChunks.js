// TASKS.csv #583 — Array.map that hands the thread back between chunks, so a long per-row loop on the UI thread
// (building 190,000 assay rows took 1.45 s in one block) lets the window repaint and stay responsive. Same result
// as rows.map(fn); onProgress(fraction) after each chunk.
export async function mapInChunks(rows, fn, { chunk = 8000, onProgress } = {}) {
  const out = new Array(rows.length);
  for (let start = 0; start < rows.length; start += chunk) {
    const end = Math.min(rows.length, start + chunk);
    for (let i = start; i < end; i++) out[i] = fn(rows[i], i);
    if (end < rows.length) {
      onProgress?.(end / rows.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return out;
}
