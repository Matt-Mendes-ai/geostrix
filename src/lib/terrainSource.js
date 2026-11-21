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

// TASKS.csv #3949 (Matt's first-time test) — the section's ground line was labelled 'Ground surface (SRTM)' whatever the terrain was (his was GEM-15
// filled from GLO-30). The short name of the project terrain's source, from the service its fetch recorded (terrain.source.service), or null when it
// is not one of these (a terrain from a file): the label then reads plain 'Ground surface'.
const SHORT_SOURCES = [[/GEM-15/i, "GEM-15"], [/GLO-30|Copernicus DEM/i, "GLO-30"], [/no HRDEM/i, "MRDEM-30"], [/HRDEM/i, "HRDEM"], [/MRDEM/i, "MRDEM-30"],
  [/Terrarium|Terrain Tiles/i, "AWS Terrain Tiles"], [/Canadian Digital Elevation Model|\bCDEM\b/i, "CDEM"], [/\bSRTM\b/i, "SRTM"]];
export function terrainShortName(terrain) {
  const svc = String(terrain?.source?.service ?? "");
  return (svc && SHORT_SOURCES.find(([re]) => re.test(svc))?.[1]) || null;
}
