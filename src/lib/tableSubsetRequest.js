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
// the memory a subset of k columns needs, from tabular.js tableColumnsPreview's figures
export const subsetBytes = (pv, k) => pv.fixed + pv.perColumn * k;
