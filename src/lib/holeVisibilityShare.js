// TASKS.csv #3605 (Fireweed rehearsal, Macpass) — with 143 of 559 holes checked in the 3D View, the Maps plan and a new Layout drill plan drew all 559
// and said nothing. The 3D View's checked holes (visibleHoles: { hole_id: false } = hidden) live in the viewer's own state; the viewer publishes them
// here for the other tabs to read (session only, like the filter itself).
import { useSyncExternalStore } from "react";

let current = {};
const listeners = new Set();
export function publishHoleVisibility(map) { const m = map || {}; if (m === current) return; current = m; listeners.forEach((l) => l()); }
export const holeVisibilityNow = () => current;
export const useHoleVisibility = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
export const hiddenIn = (collars, vis) => { let n = 0; for (const c of collars || []) if (vis?.[c.hole_id] === false) n++; return n; };
export const checkedOnly = (collars, vis) => (hiddenIn(collars, vis) ? (collars || []).filter((c) => vis[c.hole_id] !== false) : collars);
