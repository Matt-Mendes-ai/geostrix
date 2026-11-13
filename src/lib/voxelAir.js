// TASKS.csv #3159 — maskAirCells and the no-data sentinels, moved verbatim out of voxel.js: the layer legends and the surface plan
// use maskAirCells at startup, and importing it from voxel.js put the UBC / block-model parsers in the startup bundle (voxel.js
// is otherwise loaded on use). voxel.js imports these and re-exports maskAirCells.
// UBC-GIF codes use various no-data sentinels (-99999, -1e30…). TASKS.csv #480: this was -1e10, which let the most
// common one, -99999, through as real data; no physical property GeoStrix models reaches -99999.
export const NODATA_MAX = -99999;
export const COARSEN_NODATA_SENTINEL = -1e30; // below NODATA_MAX, so a coarse cell with zero contributing fine cells reads as no-data too

// TASKS.csv #481 — "air" in a conductivity model. SimPEG and UBC-GIF write the cells above the topography as
// a tiny conductivity (1e-8 S/m), not as a no-data code: a real ZTEM inversion (Woodjam, 330x348x63) had
// half of its displayed cells at exactly 1e-8, drawn as real rock and averaged into the near-surface cells
// (#482: its OMF copy uses Float32's smallest normal number, 1.18e-38, instead — the rule catches both)
// when the mesh was reduced for the 3D view. When the SMALLEST value is <= 1e-8 and at least `minShare` of
// the cells hold exactly it, those cells are marked no-data (in place). Returns { count, value } (count 0 =
// nothing changed). A model that genuinely contains many cells of one tiny value is rare; the import
// message states what was done either way.
// TASKS.csv #1659 (review #1646, Kodiak) — a DCIP3D chargeability model marks air as -1 (81,460 of Kodiak's 380,250 cells): it was drawn
// as a slab of rock over the model and averaged into the near-surface blocks. A NEGATIVE minimum is air too when it fills at least
// minShare of the cells and no other value is negative (a model that really holds negatives, e.g. a susceptibility, is left alone).
export function maskAirCells(values, minShare = 0.05) {
  let min = Infinity, negatives = 0;
  for (let i = 0; i < values.length; i++) { const v = values[i]; if (Number.isFinite(v) && v > NODATA_MAX) { if (v < min) min = v; if (v < 0) negatives++; } }
  const tinyAir = min > 0 && min <= 1e-8;
  let flagAir = false;
  // #1831 — or nearly all of them: a model reduced for the view before #1659 averaged the air into mixed blocks (Kodiak's saved
  // chargeability: 19,824 cells at -1 and 439 between -0.75 and 0), and those few must not keep the flag from being seen
  if (min < 0) { let atMin = 0; for (let i = 0; i < values.length; i++) if (values[i] === min) atMin++; flagAir = atMin === negatives || atMin >= 0.9 * negatives; }
  if (!tinyAir && !flagAir) return { count: 0, value: null };
  let count = 0;
  for (let i = 0; i < values.length; i++) if (values[i] === min) count++;
  if (count < minShare * values.length) return { count: 0, value: null };
  for (let i = 0; i < values.length; i++) if (values[i] === min) values[i] = COARSEN_NODATA_SENTINEL;
  return { count, value: min };
}
