// TASKS.csv #3563 / #3569 — the drillhole data table (components/DrillTableModal.jsx, a lazy chunk) opened from anywhere: the 3D View ribbon, a layer's inspector, Geochem's
// sidebar, a Data QC row. A DOM event, as lib/help.js does for Help: the sender needs no props through ViewerModule. detail: { source?: "assays" | a layer key, hole?, from?, to? }
const EVENT = "geostrix:data-table";
export function openDataTable(detail = {}) {
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail })); } catch (_) { /* no window (tests) */ }
}
export function onDataTableOpen(cb) {
  const h = (e) => cb(e.detail || {});
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
