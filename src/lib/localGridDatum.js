// TASKS.csv #2691 / #2661 (follow-ups of #2497 and #2491) — what a local mine grid says about itself beside its tie (#2288):
// rlOffset: the grid's RL datum, grid RL = elevation + rlOffset (a mine datum of +1000: RL 1,250 is 250 m above sea level), so the RL a
// project is kept in is said and a real-elevation value (an AHD terrain, an MGA collar file) can be brought into it;
// northDeg: for a grid with NO tie, how far its grid north is turned from true north (east positive: "grid north is 15° east of true
// north"); a tie knows its own rotation and is used instead. A true bearing B on such a grid is B - northDeg. Pure.

const finite = (v) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const onGrid = (project) => project?.crsSet === false && !!project?.localGrid;

// -> number (metres) or null: the grid RL minus the elevation
export const rlOffsetOf = (project) => (onGrid(project) ? finite(project.localGrid.rlOffset) : null);
// -> number (degrees, east of true north positive) or null; only for a grid without a tie
export const untiedNorthOf = (project) => (onGrid(project) && !project.localGrid.tie ? finite(project.localGrid.northDeg) : null);
// a true bearing on an untied grid -> the grid bearing (0-360)
export const trueToUntiedGrid = (bearing, northDeg) => ((((Number(bearing) - Number(northDeg)) % 360) + 360) % 360);
// an elevation (sea level) -> the grid's RL, and back
export const elevationToRl = (z, rlOffset) => Number(z) + Number(rlOffset || 0);
export const rlToElevation = (rl, rlOffset) => Number(rl) - Number(rlOffset || 0);
// the patch the store's setter writes: blank clears the value
export function datumPatch({ rlOffset, northDeg } = {}) {
  const out = {};
  if (rlOffset !== undefined) out.rlOffset = finite(rlOffset);
  if (northDeg !== undefined) { const n = finite(northDeg); out.northDeg = n == null ? null : Math.abs(n) <= 180 ? n : null; }
  return out;
}
