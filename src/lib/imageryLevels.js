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
export function planLatestFetch([lonMin, latMin, lonMax, latMax], level = "standard", nativeM = NATIVE_M) { // nativeM: #838 — NAIP's finer pixels
  if (!SAT_LEVELS[level]) level = "standard";
  const l = SAT_LEVELS[level];
  const midLat = ((latMin + latMax) / 2) * Math.PI / 180;
  const w = Math.max(1, (lonMax - lonMin) * Math.cos(midLat) * 111320), h = Math.max(1, (latMax - latMin) * 110574);
  const pixelM = Math.max(nativeM, Math.max(w, h) / l.gridMax);
  return { pixelM, gridW: Math.max(1, Math.ceil(w / pixelM)), gridH: Math.max(1, Math.ceil(h / pixelM)), nativeLimited: pixelM === nativeM, level };
}

// TASKS.csv #1766 (review #1645, Copley) — Standard, High and Very high all read '~10 m pixels · image 293 x 267 px' for Sentinel-2 on a
// small area: the levels that would fetch the same grid as a lower level, here (a Set of level keys; empty when every level differs)
export function levelsAddingNothing(bbox, nativeM = NATIVE_M) {
  const out = new Set();
  if (!bbox) return out;
  const keys = Object.keys(SAT_LEVELS);
  for (let i = 1; i < keys.length; i++) {
    const a = planLatestFetch(bbox, keys[i - 1], nativeM), b = planLatestFetch(bbox, keys[i], nativeM);
    if (a.gridW === b.gridW && a.gridH === b.gridH) out.add(keys[i]);
  }
  return out;
}

// TASKS.csv #1474 (review #1352, Silvertip) — NAIP was offered at 59.9°N 130.3°W and failed only after the catalogue search. NAIP is flown over
// the contiguous USA; a coarse box around it says, with no network, whether a drawn area [lonMin, latMin, lonMax, latMax] can have any:
// "outside" (no overlap), "partial" (part of it is outside), "inside".
export const NAIP_BOX = [-125.0, 24.4, -66.9, 49.4];
export function naipCoverage([lonMin, latMin, lonMax, latMax]) {
  const [w, s, e, n] = NAIP_BOX;
  if (lonMax < w || lonMin > e || latMax < s || latMin > n) return "outside";
  return lonMin >= w && lonMax <= e && latMin >= s && latMax <= n ? "inside" : "partial";
}
