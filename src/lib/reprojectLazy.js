// TASKS.csv #4084 — how the startup code reaches the coordinate maths (lib/reproject.js, which carries proj4 and wkt-parser, ~130 kB): by a dynamic import, started once the first screen has been committed,
// so none of it is in the startup bundle. Code that itself loads on use imports reproject.js directly (its chunk brings proj4 along, in parallel, and has it when its code runs); this is only for the few
// things the first screen draws: the cursor's latitude / longitude in the status bar (blank for the few tens of milliseconds the module takes to arrive) and the async toLonLat.
import { useEffect, useState } from "react";

const START_DELAY_MS = 400, IDLE_TIMEOUT_MS = 1000, HIDDEN_FALLBACK_MS = 4000; // the fixed delay where there is no requestIdleCallback; the longest wait for an idle moment; a window that runs no animation frames
let mod = null, loading = null;
const listeners = new Set();

// the module, once loaded (a promise; the load starts at the first call and is shared)
export function loadReproject() {
  if (!loading) loading = import("./reproject.js").then((m) => { mod = m; listeners.forEach((f) => f()); return m; });
  return loading;
}
// the module if it is already here, else null (never starts a load)
export const reprojectModule = () => mod;
// true once loaded; the component re-renders when it arrives; the first use starts the load (an effect: after the first paint)
export function useReprojectReady() {
  const [, bump] = useState(0);
  useEffect(() => {
    if (mod) return undefined;
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    // not in the first commit's effects: the module's evaluation (~12 ms) there ran before the first paint (first contentful paint measured ~20 ms later than without it). Started once the first frame is on screen
    // (two animation frames: the first one's callback runs before its paint), then when the main thread is idle (requestIdleCallback, at most ~1 s later; a fixed delay where there is none). A window that is
    // hidden runs no frames, so a timer starts it anyway. The readout is blank for that long, which is nothing (the mouse is not over the view yet), and a chunk that loads on use brings the maths with it.
    let started = false, raf = 0, idle = 0;
    const go = () => { if (started) return; started = true; loadReproject().catch(() => {}); };
    const idleStart = () => { if (typeof requestIdleCallback === "function") idle = requestIdleCallback(go, { timeout: IDLE_TIMEOUT_MS }); else setTimeout(go, START_DELAY_MS); };
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(() => { raf = requestAnimationFrame(idleStart); }); else idleStart();
    const fallback = setTimeout(go, HIDDEN_FALLBACK_MS);
    return () => { cancelAnimationFrame?.(raf); if (idle && typeof cancelIdleCallback === "function") cancelIdleCallback(idle); clearTimeout(fallback); listeners.delete(f); };
  }, []);
  return !!mod;
}
// the same toLonLat as reproject.js's, for startup code
export async function toLonLat(x, y, epsg) { return (await loadReproject()).toLonLat(x, y, epsg); }
