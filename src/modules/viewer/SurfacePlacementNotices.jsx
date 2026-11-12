// TASKS.csv #2485 (1) — the surface samples' placement notices, shown on the 3D View's sidebar AND on the Surface Geology
// tab, where the samples are styled (it said nothing there). Counts from useSurfacePlacement.
import { t as tr } from "../../lib/i18n.js";

const lineStyle = { fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", padding: "2px 2px 4px", lineHeight: 1.4 };

export default function SurfacePlacementNotices({ counts, z }) {
  if (!counts) return null;
  const zr = Math.round(z);
  return (<>
    {counts.noTerrain > 0 && ( // TASKS.csv #1818
      <div style={lineStyle}>{tr("{n} surface sample(s) have no elevation and there is no terrain: drawn flat at {z} m (the median collar, the highest on an underground project, or the samples' own). Load a terrain (Maps > Terrain) to place them on the ground.", { n: counts.noTerrain, z: zr })}</div>
    )}
    {counts.outside > 0 && ( // TASKS.csv #1806
      <div style={lineStyle}>{tr("{n} surface sample(s) have no elevation and lie outside the terrain's footprint: drawn flat at {z} m. A terrain that covers them (Maps > Terrain) places them on the ground.", { n: counts.outside, z: zr })}</div>
    )}
    {counts.tinGap > 0 && ( // TASKS.csv #2571 — the terrain in hand is the cause: no advice to load one that covers them
      <div style={lineStyle}>{tr("{n} surface sample(s) have no elevation and lie over gaps of the terrain triangulated from points, where it has no data: drawn flat at {z} m.", { n: counts.tinGap, z: zr })}</div>
    )}
    {counts.unplaced > 0 && ( // TASKS.csv #606; with no terrain, or outside it, they are drawn flat (above)
      <div style={lineStyle}>{tr("{n} surface sample(s) have no elevation and lie over a void of the terrain (no data there): not placed.", { n: counts.unplaced })}</div>
    )}
  </>);
}
