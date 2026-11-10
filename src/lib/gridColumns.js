// TASKS.csv #2151 (WA review #2148) — coordinate columns named for their grid: MGA_East / MGA_North, GDA94_E / GDA94_N, AMG_E, GBMG_East,
// Nat_East, Local_E, with MGA_RL / Orig_RL. An east and a north column count only as a PAIR with the same prefix (so "Dip_E" or "Line_E" +
// "Station_N" never do); a one-letter suffix needs its underscore. -> [{ prefix, x, y, z }], map grids (MGA / GDA / AMG / UTM) first and
// local / mine grids last; z is the same grid's RL / elevation when the file has one.
// TASKS.csv #2564 (review #2486, WA lithium) — moved here from layers.js so the surface-sample and outcrop-structure guessers (mapLayers.js,
// which layers.js imports) read the same names: a rock-chip table on MGA_E / MGA_N / MGA_Z was not recognized as surface samples.
const normH = (h) => String(h ?? "").toLowerCase().trim()
  .replace(/\s*[([][^)\]]*[)\]]\s*$/, "")
  .replace(/%/g, " pct ").trim()
  .replace(/[\s\-/]+/g, "_").replace(/^_+|_+$/g, ""); // layers.js normHeader
const GRID_COL = /^([a-z][a-z0-9]*?)(?:_(e|n|x|y|z)|_?(east|easting|north|northing|rl|elev|elevation))$/;
const GRID_AXIS = { e: "x", x: "x", east: "x", easting: "x", n: "y", y: "y", north: "y", northing: "y", z: "z", rl: "z", elev: "z", elevation: "z" };
const gridRank = (p) => (/^(mga|gda|amg|utm|map|grid|nat)/.test(p) ? 0 : /^(local|loc|mine|orig|old|site)/.test(p) ? 2 : 1);
export function gridCoordinateColumns(headers) {
  const by = new Map();
  for (const h of headers || []) {
    const m = GRID_COL.exec(normH(h));
    if (!m) continue;
    const axis = GRID_AXIS[m[2] || m[3]];
    if (!by.has(m[1])) by.set(m[1], {});
    const g = by.get(m[1]);
    if (!g[axis]) g[axis] = h;
  }
  return [...by].filter(([, g]) => g.x && g.y).map(([prefix, g]) => ({ prefix, x: g.x, y: g.y, z: g.z || "" }))
    .sort((a, b) => gridRank(a.prefix) - gridRank(b.prefix));
}
// any RL / elevation column of a grid ("Orig_RL" beside GBMG_East / GBMG_North), for a pair with no z of its own
export const gridElevation = (headers) => (headers || []).find((h) => { const m = GRID_COL.exec(normH(h)); return m && GRID_AXIS[m[2] || m[3]] === "z"; }) || "";
// #2564 — the map-grid pair of a table (the first, map grids before local ones), or null
export function gridXY(headers) {
  const g = gridCoordinateColumns(headers)[0];
  return g ? { x: g.x, y: g.y, z: g.z || gridElevation(headers) || "" } : null;
}
