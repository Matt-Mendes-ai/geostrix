import { useCallback, useState } from "react";

// TASKS.csv #12 — "Database connector: saved query library (not just last-run SQL)." The DB connect
// modal only ever remembered the LAST query typed (in local component state, gone once the modal
// closes) — no way to keep a handful of named queries around (e.g. "all VMS-style Au>1 intercepts",
// "holes missing survey") and reuse them across sessions or across different saved connections. A
// personal workspace convenience, not project data, so it lives in localStorage — same pattern
// useSidebarWidth.js already established — rather than the .geox project file (a query someone finds
// useful is useful across every project they open, not scoped to one).
const STORAGE_KEY = "geostrix-saved-queries";

function readStored() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((q) => q && typeof q.name === "string" && typeof q.sql === "string") : [];
  } catch (_) { return []; }
}

function writeStored(queries) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queries)); } catch (_) { /* ignore (private mode, etc.) */ }
}

export function useSavedQueries() {
  const [queries, setQueries] = useState(readStored);

  const saveQuery = useCallback((name, sql) => {
    setQueries((prev) => {
      const next = [...prev.filter((q) => q.name !== name), { name, sql }];
      writeStored(next);
      return next;
    });
  }, []);

  const removeQuery = useCallback((name) => {
    setQueries((prev) => {
      const next = prev.filter((q) => q.name !== name);
      writeStored(next);
      return next;
    });
  }, []);

  return { queries, saveQuery, removeQuery };
}
