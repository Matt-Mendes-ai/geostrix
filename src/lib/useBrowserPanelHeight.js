import { useCallback, useState } from "react";

// TASKS.csv #206 — "I want to be able to resize both layer and browser panel." Same pattern as
// useSidebarWidth.js (that hook controls the WHOLE left column's width; this one controls how that
// column's height is split between the existing Layers-equivalent panel on top and the new Browser
// panel underneath it) — a plain localStorage-backed value, since it's a personal UI layout preference
// rather than project data that belongs in the .geox project file.
const STORAGE_KEY = "geostrix-browser-panel-height";
const MIN_HEIGHT = 90;
const MAX_HEIGHT = 640;
const DEFAULT_HEIGHT = 220;

function readStoredHeight() {
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(raw) && raw >= MIN_HEIGHT && raw <= MAX_HEIGHT) return raw;
  } catch (_) { /* localStorage unavailable — fall through to default */ }
  return DEFAULT_HEIGHT;
}

export function useBrowserPanelHeight() {
  const [height, setHeightState] = useState(readStoredHeight);

  const setHeight = useCallback((next) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(next)));
    setHeightState(clamped);
    try { window.localStorage.setItem(STORAGE_KEY, String(clamped)); } catch (_) { /* ignore */ }
  }, []);

  return [height, setHeight];
}
