// TASKS.csv #4051 — the satellite scene an index layer was made from, read off the layer (its `spectralIndex`, set by SpectralIndexModal): its id and date (shown on the
// layer), the area it was fetched for (so the same scene can be read again in true colour) and the snow counts. Pure.
export const isSentinelScene = (id) => /^S2[ABC]?_/i.test(String(id || ""));

// -> { id, date, sentinel, areaLonLat | null, trueColour, snow | null } or null when the layer is not from a fetched scene
export function sceneOfRaster(raster) {
  const si = raster?.spectralIndex;
  if (!si?.scene) return null;
  const id = String(si.scene), a = si.areaLonLat;
  return {
    id, date: String(si.date || ""), sentinel: si.sensor === "sentinel2" || isSentinelScene(id),
    areaLonLat: Array.isArray(a) && a.length === 4 && a.every(Number.isFinite) ? a : null,
    trueColour: !!si.trueColour, snow: si.snow || null,
  };
}
