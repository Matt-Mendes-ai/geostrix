// TASKS.csv #1801 (review #1646, Kodiak) — Compositing opened on 2 m while 68 % of the samples were 3 m: every 3 m sample was split into a 2 m
// and a 1 m piece (8,209 composites from 5,974 samples). The opening length is the project's commonest sample length instead.
// assays: rows with from / to; QC inserts and zero-length rows are left out (isQc: row -> true for a standard / blank / duplicate).
// Lengths are counted to the nearest 0.1 m. -> { length, share (0-1), n } or null with no interval
export function commonestSampleLength(assays, isQc = () => false) {
  const counts = new Map();
  let n = 0;
  for (const a of assays || []) {
    const f = Number(a?.from), t = Number(a?.to);
    if (!Number.isFinite(f) || !Number.isFinite(t) || !(t > f) || isQc(a)) continue;
    const len = Math.round((t - f) * 10) / 10;
    counts.set(len, (counts.get(len) || 0) + 1); n++;
  }
  if (!n) return null;
  let best = null;
  for (const [len, k] of counts) if (!best || k > best[1] || (k === best[1] && len > best[0])) best = [len, k];
  return { length: best[0], share: best[1] / n, n };
}
