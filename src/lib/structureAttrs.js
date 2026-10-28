// TASKS.csv #1067 (review #1016, structural geologist) — a downhole structure pick as GIS attributes: its type, dip, the dip
// direction named for what it is and in which north (stored grid, #547), the true-north one beside it, and the right-
// hand-rule strike. It went out as a bare "azimuth" next to "value". convergence: grid north's bearing from true north
// at the pick (trueNorthBearingInGridDeg), or null.
export function structureGisAttributes(r, convergence) {
  const num = (v) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null);
  const dd = num(r.azimuth), w = (a) => +((((a % 360) + 360) % 360).toFixed(2));
  const skip = new Set(["hole_id", "depth", "value", "dip", "azimuth", "alpha", "beta"]);
  return {
    hole_id: r.hole_id, depth: num(r.depth), type: r.value ?? null, dip: num(r.dip),
    dipdir_grid: dd, dipdir_true: dd != null && Number.isFinite(convergence) ? w(dd - convergence) : null, strike_rhr: dd != null ? w(dd - 90) : null,
    alpha: num(r.alpha), beta: num(r.beta),
    ...Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith("_") && !skip.has(k) && v !== undefined)),
  };
}
