// TASKS.csv #2485 (1) — the surface samples' placement notices, shown on the 3D View's sidebar AND on the Surface Geology
// tab, where the samples are styled (it said nothing there). Counts from useSurfacePlacement.
import { t as tr } from "../../lib/i18n.js";
import { FAR_FROM_COLLAR_M } from "../../lib/viewer/surfacePlacement.js"; // TASKS.csv #3392

const lineStyle = { fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", padding: "2px 2px 4px", lineHeight: 1.4 };

export default function SurfacePlacementNotices({ counts, z }) {
  if (!counts) return null;
  const zr = Math.round(z);
  return (<>
    {counts.collars > 0 && ( // TASKS.csv #3368 — the one rule for everything drawn on the ground with no terrain
      <div style={lineStyle}>{tr("{n} surface sample(s) have no elevation and there is no terrain: drawn on the surface through the collar elevations, as the map layers are. Load a terrain (Maps > Terrain) to place them on the ground.", { n: counts.collars })}</div>
    )}
    {counts.collars > 0 && counts.collarGap?.far > 0 && ( // TASKS.csv #3392 — beyond the drilling the collar surface is a guess
      <div style={lineStyle}>{tr("{n} of them lie more than {d} m from the nearest collar (the farthest {m} m): the surface through the collars is a guess there. A terrain gives the real ground.", { n: counts.collarGap.far.toLocaleString(), d: FAR_FROM_COLLAR_M, m: Math.round(counts.collarGap.maxM).toLocaleString() })}</div>
    )}
    {counts.noTerrain > 0 && ( // TASKS.csv #1818; #3368 — the rule it used, not three possible ones
      <div style={lineStyle}>{counts.flatRule === "highest-collar" ? tr("{n} surface sample(s) have no elevation and there is no terrain: drawn flat at {z} m, the highest collar (the collars look underground). Load a terrain (Maps > Terrain) to place them on the ground.", { n: counts.noTerrain, z: zr })
        : counts.flatRule === "collars" ? tr("{n} surface sample(s) have no elevation and there is no terrain: drawn flat at {z} m, the median collar elevation. Load a terrain (Maps > Terrain) to place them on the ground.", { n: counts.noTerrain, z: zr })
        : counts.flatRule === "zero" ? tr("{n} surface sample(s) have no elevation, and no collar or sample gives one: drawn flat at 0 m. Load a terrain (Maps > Terrain) to place them on the ground.", { n: counts.noTerrain }) /* TASKS.csv #3851 (5) */
        : tr("{n} surface sample(s) have no elevation and there is no terrain: drawn flat at {z} m, the median elevation of the samples that have one. Load a terrain (Maps > Terrain) to place them on the ground.", { n: counts.noTerrain, z: zr })}</div>
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
