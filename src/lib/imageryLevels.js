// TASKS.csv #781 / #837 — resolution levels for the satellite-image fetch, and what a level would give for an area.
// The fetch (imageryFetch.js fetchLatestTrueColour, #816) reads the latest clear Sentinel-2 scene at its native 10 m
// or coarser when the area is wider than gridMax pixels: a level only decides how much of the 10 m detail is KEPT
// over a large area. #837: the EOX cloudless mosaic (CC BY-NC-SA 4.0 from 2018 on, non-commercial) is no longer
// fetched into the project; it stays as the display-only Satellite basemap (baseLayers.js).
export const NATIVE_M = 10;
export const SAT_LEVELS = {
  standard: { label: "Standard", gridMax: 1024 },
  high: { label: "High", gridMax: 2048 },
  veryhigh: { label: "Very high", gridMax: 3072 },
};

// Shown before fetching: { pixelM, gridW, gridH, nativeLimited } for a lon / lat box at a level. Metres from degrees
// at the box's middle latitude (good to ~1 % here); the real grid is laid out in the scene's own UTM by windowGrid
// with the same rule (native cell, or the longest side / gridMax when that is coarser).
export function planLatestFetch([lonMin, latMin, lonMax, latMax], level = "standard") {
  if (!SAT_LEVELS[level]) level = "standard";
  const l = SAT_LEVELS[level];
  const midLat = ((latMin + latMax) / 2) * Math.PI / 180;
  const w = Math.max(1, (lonMax - lonMin) * Math.cos(midLat) * 111320), h = Math.max(1, (latMax - latMin) * 110574);
  const pixelM = Math.max(NATIVE_M, Math.max(w, h) / l.gridMax);
  return { pixelM, gridW: Math.max(1, Math.ceil(w / pixelM)), gridH: Math.max(1, Math.ceil(h / pixelM)), nativeLimited: pixelM === NATIVE_M, level };
}
