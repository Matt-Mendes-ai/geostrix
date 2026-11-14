// TASKS.csv #2485 — the surface samples' placement (moved out of ViewerModule.jsx). See lib/viewer/surfacePlacement.js.
import { useMemo, useRef } from "react";
import { collarsLookUnderground } from "../../lib/collarGround.js"; // TASKS.csv #3159: not pitShell.js, which put the pit solver in startup
import { terrainGroundAt } from "../../lib/viewer/geomath.js";
import { surfaceFlatElevation, placeSurfaceSamples, samePlacement, surfacePlacementCounts, noTerrainGround, setOutcropNoTerrainGround, surfaceFlatRule } from "../../lib/viewer/surfacePlacement.js"; // the collar ground: #3368

// TASKS.csv #1819 — a placed copy (draped or flat) -> the store's sample, so classes computed on every sample find the drawn ones
const placedSrc = new WeakMap();

export function useSurfacePlacement({ collars, survey, surfaceSamples, terrain }) {
  const underground = useMemo(() => collars.length > 1 && collarsLookUnderground(collars, survey).underground, [collars, survey]);
  const surfaceFlatZ = useMemo(() => surfaceFlatElevation(collars, surfaceSamples, underground), [collars, surfaceSamples, underground]);
  // TASKS.csv #3368 — with no terrain, samples and outcrop readings with no elevation lie on the surface through the collars, as map layers do
  const collarAt = useMemo(() => (terrain ? null : noTerrainGround(collars, underground)), [terrain, collars, underground]);
  useMemo(() => setOutcropNoTerrainGround(collarAt), [collarAt]);
  const placedRef = useRef(null);
  const placedSurfaceSamples = useMemo(() => {
    const next = placeSurfaceSamples(surfaceSamples, terrain, surfaceFlatZ, terrainGroundAt, placedSrc, collarAt);
    if (next === surfaceSamples) return next;
    const prev = placedRef.current;
    if (prev && prev.src === surfaceSamples && samePlacement(prev.out, next)) return prev.out;
    placedRef.current = { src: surfaceSamples, out: next };
    return next;
  }, [surfaceSamples, terrain, surfaceFlatZ, collarAt]);
  const placementCounts = useMemo(() => ({ ...surfacePlacementCounts(surfaceSamples, placedSurfaceSamples), flatRule: surfaceFlatRule(collars, underground) /* #3368 */ }), [surfaceSamples, placedSurfaceSamples, collars, underground]);
  // #1819 — each drawn sample's index in surfaceSamples (the anomaly classes are per surfaceSamples index)
  const surfaceDrawnIdx = useMemo(() => {
    if (placedSurfaceSamples === surfaceSamples) return null;
    const at = new Map(surfaceSamples.map((r, i) => [r, i]));
    return placedSurfaceSamples.map((r) => at.get(placedSrc.get(r) || r) ?? -1);
  }, [surfaceSamples, placedSurfaceSamples]);
  return { surfaceFlatZ, placedSurfaceSamples, placementCounts, surfaceSamplesUnplaced: placementCounts.unplaced, surfaceDrawnIdx };
}
