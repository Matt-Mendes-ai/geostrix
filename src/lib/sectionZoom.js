// TASKS.csv #4009 (Matt: 'I want to be able to zoom on the cross section so that I can draw easily') — the section window's view transform. A zoom is a VIEW only: the
// section's scale, its VE and the exports are the fitted section's, unchanged. The view is a window on the fitted drawing: k (1 = the whole section, up to ZOOM_MAX)
// and the window's centre as a fraction of the fitted extents (fx along the line from A, fz up from the lowest elevation), so it survives a VE change, a resize and a
// reopened tab. Pure: SectionWindow keeps the state per tab and SectionSVG maps through windowOf().
export const ZOOM_MIN = 1, ZOOM_MAX = 40, WHEEL_STEP = 1.25, BUTTON_STEP = 1.5;
export const FIT = Object.freeze({ k: 1, fx: 0.5, fz: 0.5 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const kOf = (k) => clamp(Number.isFinite(k) ? k : 1, ZOOM_MIN, ZOOM_MAX);
// a centre that keeps the window inside the fitted extents: half a window from either edge
const centre = (f, k) => clamp(Number.isFinite(f) ? f : 0.5, 0.5 / k, 1 - 0.5 / k);
export const isFit = (v) => !v || v.k <= 1.000001;

export function normalize(v) {
  const k = kOf(v?.k);
  return k <= 1.000001 ? { ...FIT } : { k, fx: centre(v?.fx, k), fz: centre(v?.fz, k) };
}

// zoom to k2 keeping the point under the pointer where it is. p: the pointer's place in the plot as fractions, px from the left (0..1), pz from the BOTTOM (0..1).
export function zoomAt(v, k2, px = 0.5, pz = 0.5) {
  const a = normalize(v), k = kOf(k2);
  if (k <= 1.000001) return { ...FIT };
  const qx = a.fx - 0.5 / a.k + clamp(px, 0, 1) / a.k, qz = a.fz - 0.5 / a.k + clamp(pz, 0, 1) / a.k; // the data point under the pointer (fractions of the extents)
  return normalize({ k, fx: qx - clamp(px, 0, 1) / k + 0.5 / k, fz: qz - clamp(pz, 0, 1) / k + 0.5 / k });
}
export const zoomBy = (v, factor, px, pz) => zoomAt(v, normalize(v).k * factor, px, pz);
// pan by a drag of (dpx, dpz): fractions of the PLOT's width / height, dpx to the right, dpz upward; the picture follows the hand
export function panBy(v, dpx, dpz) {
  const a = normalize(v);
  if (a.k <= 1.000001) return a;
  return normalize({ k: a.k, fx: a.fx - dpx / a.k, fz: a.fz - dpz / a.k });
}

// the window in data units: along-line distance [L0, L1] and elevation [Z0, Z1] from the fitted extents
export function windowOf(v, minL, maxL, minZ, maxZ) {
  const a = normalize(v);
  if (a.k <= 1.000001) return { k: 1, L0: minL, L1: maxL, Z0: minZ, Z1: maxZ }; // exactly the extents: a fitted section is drawn as it always was
  const wl = (maxL - minL) / a.k, wz = (maxZ - minZ) / a.k;
  const L0 = minL + a.fx * (maxL - minL) - wl / 2, Z0 = minZ + a.fz * (maxZ - minZ) - wz / 2;
  return { k: a.k, L0, L1: L0 + wl, Z0, Z1: Z0 + wz };
}

// the readout: 2.5 -> "×2.5", 12 -> "×12", 1 -> "×1"
export const zoomText = (v) => { const k = normalize(v).k; return `×${k >= 10 ? Math.round(k) : +k.toFixed(1)}`; };

// the pointer's place in the plot (fractions) from its position in the drawing's units: x, y in viewBox units, the plot's rect { x0, y0, w, h } (y down)
export const plotFraction = (x, y, plot) => ({ px: clamp((x - plot.x0) / plot.w, 0, 1), pz: clamp(1 - (y - plot.y0) / plot.h, 0, 1) });

// the zoom kept per tab for the session (not in the project file: a view)
const kept = new Map();
export const keepZoom = (tabId, v) => { if (tabId == null) return; if (isFit(v)) kept.delete(tabId); else kept.set(tabId, normalize(v)); };
export const keptZoom = (tabId) => (tabId != null && kept.get(tabId)) || { ...FIT };
export const forgetZoom = (tabId) => { kept.delete(tabId); };
