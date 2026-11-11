// TASKS.csv #2314 — an area's size on the ground: ~W x H km (metres under 1 km). Moved here from components/MacrostratModal.jsx for
// TASKS.csv #1765 / #2469 (reviews #1645 Copley, #2325 WA uranium): the terrain / imagery fetch-area picker gave the same area as
// '~0.171 deg x 0.139 deg' where Macrostrat said '~16 km x 15 km'. b: [lonMin, latMin, lonMax, latMax]. Pure.
export function areaSizeText(b) {
  if (!b) return "";
  const midLat = ((b[1] + b[3]) / 2) * Math.PI / 180, w = (b[2] - b[0]) * 111.32 * Math.cos(midLat), h = (b[3] - b[1]) * 110.57;
  const f = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km`);
  return `~${f(w)} × ${f(h)}`;
}
