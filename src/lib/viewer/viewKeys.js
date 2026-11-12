// TASKS.csv #2788 (split from #2045) — keyboard zoom on the focused 3D view (#575's focusable view, its onViewKeyDown): + or = zoom in, - out
// (the keypad's too), Home fits as the Fit button does. Only on the view itself (a field, a button or a menu keeps its keys), and never with
// Ctrl / Cmd / Alt: Ctrl/Cmd + / - stay the window zoom (#2045). zoom(f) multiplies the orbit radius by f; fit() is the Fit button.
export const KEY_ZOOM_STEP = 0.8; // one press: 20 % closer, or 25 % farther back

export function viewKeyZoom(e, { zoom, fit }) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key;
  const f = k === "+" || k === "=" ? KEY_ZOOM_STEP : k === "-" || k === "_" ? 1 / KEY_ZOOM_STEP : null;
  if (f == null && k !== "Home") return false;
  e.preventDefault();
  if (f == null) fit(); else zoom(f);
  return true;
}
