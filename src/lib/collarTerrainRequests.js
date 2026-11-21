// TASKS.csv #3955 — opens the "Collar elevations from the terrain" dialog (components/CollarZFromTerrain.jsx, mounted once in App.jsx) from anywhere (Data QC).
const EVENT = "geostrix-collar-z-from-terrain";
export function requestCollarZFromTerrain() { try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* no window */ } }
export function onCollarZRequest(handler) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
