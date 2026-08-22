import { useCallback, useState } from "react";

// TASKS.csv #206 — "the recent folders that GeoStrix imported/exported data from and also option to
// add folders as favorites" for the new QGIS-style Browser panel. Both lists are personal workspace
// state (which local folders THIS user cares about), not project data, so — same reasoning as
// useSidebarWidth.js / useBrowserPanelHeight.js — they live in localStorage rather than the .geox
// project file, and survive across projects/sessions on this machine.
const RECENT_KEY = "geostrix-browser-recent-folders";
const FAVORITES_KEY = "geostrix-browser-favorite-folders";
const MAX_RECENT = 12;

function readList(key) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.filter((p) => typeof p === "string" && p) : [];
  } catch (_) { return []; }
}
function writeList(key, list) {
  try { window.localStorage.setItem(key, JSON.stringify(list)); } catch (_) { /* ignore */ }
}

export function useBrowserPanelPrefs() {
  const [recent, setRecentState] = useState(() => readList(RECENT_KEY));
  const [favorites, setFavoritesState] = useState(() => readList(FAVORITES_KEY));

  // Called whenever GeoStrix actually imports/exports through a folder (a real file dialog result, or
  // a Browser-panel file click) — most-recent-first, de-duped, capped so this can't grow unbounded.
  const noteRecentFolder = useCallback((folderPath) => {
    if (!folderPath) return;
    setRecentState((prev) => {
      const next = [folderPath, ...prev.filter((p) => p !== folderPath)].slice(0, MAX_RECENT);
      writeList(RECENT_KEY, next);
      return next;
    });
  }, []);

  const addFavorite = useCallback((folderPath) => {
    if (!folderPath) return;
    setFavoritesState((prev) => {
      if (prev.includes(folderPath)) return prev;
      const next = [...prev, folderPath].sort((a, b) => a.localeCompare(b));
      writeList(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((folderPath) => {
    setFavoritesState((prev) => {
      const next = prev.filter((p) => p !== folderPath);
      writeList(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  return { recent, favorites, noteRecentFolder, addFavorite, removeFavorite };
}
