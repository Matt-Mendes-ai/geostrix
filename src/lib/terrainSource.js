// TASKS.csv #3882 (Matt, 2026-11-17: "let's make glo-20 the default terrain", read as Copernicus GLO-30) — the online elevation model a NEW terrain fetch
// reads when the person has not chosen one. GLO-30 sat within a median 0.4 m of the surveyed collars on both flat WA samples where the AWS Terrain Tiles
// sat 3 m high (#3726), and AWS carries suspect cones (#814). Only the default changes: a source chosen before is kept (the choice is remembered on this
// computer), a project's saved terrain keeps the service it was fetched from, and AWS, NRCan MRDEM-30 / HRDEM, GEM-15 stay choices. Pure (the storage
// is passed in), so a test can check it.
export const DEFAULT_TERRAIN_SOURCE = "copernicus";
export const TERRAIN_SOURCES = ["copernicus", "aws", "mrdem", "hrdem", "gem15", "gem15dsm"];
export const TERRAIN_SOURCE_KEY = "geostrix.terrainSource";
// the remembered source, or the default when none was chosen (or the stored value is not one this version knows)
export function savedTerrainSource(storage) {
  try { const v = storage?.getItem(TERRAIN_SOURCE_KEY); return TERRAIN_SOURCES.includes(v) ? v : DEFAULT_TERRAIN_SOURCE; } catch { return DEFAULT_TERRAIN_SOURCE; }
}
