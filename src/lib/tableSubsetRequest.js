// TASKS.csv #2177 — the column chooser's request, kept apart from lib/tabular.js so the app shell can listen for it without loading
// papaparse at start-up (#1493). tabular.js asks; App renders TableColumnsModal and answers { keep } | true (whole) | false.
const EVENT = "geostrix-table-subset";
let listeners = 0;
export function onTableSubsetRequest(handler) {
  const on = (ev) => handler(ev.detail);
  window.addEventListener(EVENT, on); listeners++;
  return () => { window.removeEventListener(EVENT, on); listeners--; };
}
// null when no chooser is mounted (tests, a worker): the caller falls back to its yes / no question
export function requestTableSubset(file, preview, budget) {
  if (typeof window === "undefined" || !listeners) return null;
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent(EVENT, { detail: { name: file.name, preview, budget, resolve } })));
}
// the memory a subset of k columns needs, from tabular.js tableColumnsPreview's figures; share (TASKS.csv #2321): the part of the rows kept
export const subsetBytes = (pv, k, share = 1) => pv.fixed + pv.perColumn * k * Math.min(1, Math.max(0, share));
// TASKS.csv #2321 — what share of the preview's first rows a holes subset keeps -> { share, seen, kept } (seen 0: no sample)
export function holesShare(pv, col, ids) {
  const j = (pv.headers || []).indexOf(col), want = new Set((ids || []).map((v) => String(v).trim()));
  const rows = j < 0 ? [] : (pv.sample || []).filter((r) => r.length > j);
  const kept = rows.reduce((n, r) => n + (want.has(String(r[j]).trim()) ? 1 : 0), 0);
  return { share: rows.length ? kept / rows.length : 1, seen: rows.length, kept };
}
// TASKS.csv #2345 — the share of the rows a composite to lengthM keeps: about (the first rows' mean interval length) / lengthM, at most 1.
// -> { share, meanM, seen } (seen 0: no usable From / To in the sample, share 1)
export function compositeShare(pv, fromCol, toCol, lengthM) {
  const a = (pv.headers || []).indexOf(fromCol), b = (pv.headers || []).indexOf(toCol), L = Number(lengthM);
  if (a < 0 || b < 0 || !(L > 0)) return { share: 1, meanM: null, seen: 0 };
  let sum = 0, n = 0;
  for (const r of pv.sample || []) { const f = Number(r[a]), t = Number(r[b]); if (Number.isFinite(f) && Number.isFinite(t) && t > f) { sum += t - f; n++; } }
  if (!n) return { share: 1, meanM: null, seen: 0 };
  const meanM = sum / n;
  return { share: Math.min(1, meanM / L), meanM, seen: n };
}
