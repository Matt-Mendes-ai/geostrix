// TASKS.csv #3483 (found by side 1 while profiling #3464) — a memory leak: after Maps > Project CRS > Reproject, and any action that replaces a big
// table with a copy, every earlier generation of the layers, collars and assays stayed alive (80-110 MB per reprojection at 1.5 M log readings).
// The holder was the 3D View's own render scopes. In V8 every closure made in one render shares that render's context: the variables any of
// its closures use, `layers` among them. A useCallback / useMemo whose dependencies had not changed kept the closure of an older render, so
// the current render's scope held an older render's scope (and its layers), which held a still older one through the memos that were stale
// in it, and so on back, one generation per reprojection.
// The chain is cut where it starts: every memo of the 3D View is made again in the render where a big table is replaced (its dependencies
// get the data generation). After that render, no live closure of the 3D View comes from an older generation. The generation follows only
// the tables the drillhole build follows (generationTables), so the memos are made again only when the scene is rebuilt anyway.
import { useCallback as useCallbackReact, useMemo as useMemoReact, useRef } from "react";

let current = 0; // the generation of the component rendering now (set at the top of its render, read by its memos in the same render)

// tables: the big collections whose replacement starts a new generation -> the generation number (per component instance)
export function useDataGeneration(tables) {
  const r = useRef(null);
  if (!r.current || tables.length !== r.current.tables.length || tables.some((t, i) => t !== r.current.tables[i])) r.current = { tables, gen: (r.current?.gen || 0) + 1 };
  current = r.current.gen;
  return current;
}
// The tables that start a generation in the 3D View: the ones its drillhole build already depends on (collars, survey, custom layers, every layer
// table but the geophysics points: #1582 keeps a survey import from rebuilding every hole), so a new generation never adds a rebuild. A
// reprojection replaces the collars, so it frees every earlier generation (assays, surface samples, the points included).
export const generationTables = (store) => [store.collars, store.survey, store.customLayers, ...Object.keys(store.layers || {}).filter((k) => k !== "geophys_pts").sort().map((k) => store.layers[k])];
// useCallback / useMemo with the generation added to the dependencies (no dependency list: as React's, every render)
export const useCallbackGen = (fn, deps) => useCallbackReact(fn, deps ? [...deps, current] : deps);
export const useMemoGen = (fn, deps) => useMemoReact(fn, deps ? [...deps, current] : deps);
