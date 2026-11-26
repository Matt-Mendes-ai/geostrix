// TASKS.csv #4084 — how the startup code reaches the coordinate maths (lib/reproject.js, which carries proj4 and wkt-parser, ~130 kB): by a dynamic import, started once the first screen has been committed,
// so none of it is in the startup bundle. Code that itself loads on use imports reproject.js directly (its chunk brings proj4 along, in parallel, and has it when its code runs); this is only for the few
// things the first screen draws: the cursor's latitude / longitude in the status bar (blank for the few tens of milliseconds the module takes to arrive) and the async toLonLat.
import { useEffect, useState } from "react";

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
    loadReproject().catch(() => {});
    return () => listeners.delete(f);
  }, []);
  return !!mod;
}
// the same toLonLat as reproject.js's, for startup code
export async function toLonLat(x, y, epsg) { return (await loadReproject()).toLonLat(x, y, epsg); }
