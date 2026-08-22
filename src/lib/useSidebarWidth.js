import { useCallback, useState } from "react";

// TASKS.csv — user request: "We could have a way to expand the side bar, just regular dragging and
// dropping like in any window." All 5 module sidebars (ViewerModule, GeophysicsModule, RasterModule,
// GeochemModule, LayoutModule) share one CSS class, .ge-panel, which had a hardcoded 300px width in
// app.css — plenty for a short button list, but tight for things like the Voxel/block-model section's
// long "Import block model shapefile (.zip/.shp)..." button labels or a wide numeric legend. This hook
// backs SidebarResizeHandle.jsx: a plain shared width value (not per-module — the panel is visually
// the same piece of UI switching tabs, so a size picked once should stick everywhere, the same way an
// OS window's sidebar split stays put when you switch what's open in it) persisted in localStorage,
// since it's a personal UI preference rather than project data that belongs in the .geox project file.
const STORAGE_KEY = "geostrix-sidebar-width";
const MIN_WIDTH = 220;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 300; // matches app.css's prior hardcoded .ge-panel width, so nothing shifts on first load

function readStoredWidth() {
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH) return raw;
  } catch (_) { /* localStorage unavailable (e.g. private mode) — fall through to default */ }
  return DEFAULT_WIDTH;
}

export function useSidebarWidth() {
  const [width, setWidthState] = useState(readStoredWidth);

  const setWidth = useCallback((next) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(next)));
    setWidthState(clamped);
    try { window.localStorage.setItem(STORAGE_KEY, String(clamped)); } catch (_) { /* ignore */ }
  }, []);

  return [width, setWidth];
}
