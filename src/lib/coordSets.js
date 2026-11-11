// TASKS.csv #2492 (review #2486, WA lithium) — a collar file with two coordinate systems (MGA_E / MGA_N / MGA_Z and GBMG_East /
// GBMG_North / GBMG_RL): the dialog picked MGA without a word, the mine-grid columns were dropped without a word, and X / Y from one set
// with Z from the other raised nothing. Pure helpers: find the sets by their shared prefix (or suffix), and judge a mapping against them.

const AXES = [
  ["x", /^(E|EAST|EASTING|EASTINGS|X|LON|LONG|LONGITUDE)$/],
  ["y", /^(N|NORTH|NORTHING|NORTHINGS|Y|LAT|LATITUDE)$/],
  ["z", /^(Z|RL|ELEV|ELEVATION|ELEV_M|RL_M|Z_M|ELEVATION_M|HEIGHT)$/],
];
const norm = (h) => String(h ?? "").trim().toUpperCase().replace(/[\s.\-/]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
const axisOf = (tok) => (AXES.find(([, re]) => re.test(tok)) || [null])[0];

// one column -> { key, axis } or null. "MGA_E" -> MGA / x; "GBMG_RL" -> GBMG / z; "Easting_GDA2020" -> GDA2020 / x; "Easting" -> "" / x.
// A prefix glued to the axis (MGAE) is not split: too many ordinary words end in E or N.
export function coordColumn(h) {
  const s = norm(h);
  if (!s) return null;
  const whole = axisOf(s);
  if (whole) return { key: /^(LAT|LATITUDE|LON|LONG|LONGITUDE)$/.test(s) ? "LAT/LONG" : "", axis: whole }; // latitude / longitude: a set of its own
  const parts = s.split("_");
  for (let k = parts.length - 1; k >= 1; k--) { // prefix form: MGA94_E, COLLAR_GRID_EAST
    const axis = axisOf(parts.slice(k).join("_"));
    if (axis) return { key: parts.slice(0, k).join("_"), axis };
  }
  for (let k = 1; k < parts.length; k++) { // suffix form: EASTING_MGA, RL_LOCAL
    const axis = axisOf(parts.slice(0, k).join("_"));
    if (axis) return { key: parts.slice(k).join("_"), axis };
  }
  return null;
}

// -> [{ key, x, y, z }] : each set with at least an easting and a northing column (z may be null), in header order
export function coordinateSets(headers) {
  const by = new Map();
  for (const h of headers || []) {
    const c = coordColumn(h);
    if (!c) continue;
    if (!by.has(c.key)) by.set(c.key, { key: c.key, x: null, y: null, z: null });
    const set = by.get(c.key);
    if (!set[c.axis]) set[c.axis] = String(h);
  }
  return [...by.values()].filter((s) => s.x && s.y);
}

export const setText = (s) => [s.x, s.y, s.z].filter(Boolean).join(" / ");

// the mapping against the sets: { used, others, mixed } — used: the set holding the mapped X and Y (null when they come from two
// sets); others: the complete sets not used; mixed: { cols, whole } when the mapped X, Y and Z come from different sets while
// another set has all of them (whole: the first such set), else null
export function judgeCoordMapping(headers, mapping = {}) {
  const sets = coordinateSets(headers);
  if (!sets.length) return { sets, used: null, others: [], mixed: null };
  const setOf = (col) => (col ? sets.find((s) => s.x === col || s.y === col || s.z === col) || null : null);
  const sx = setOf(mapping.x), sy = setOf(mapping.y), sz = setOf(mapping.z);
  const used = sx && sx === sy ? sx : null;
  const others = sets.filter((s) => s !== used && !(s === sz && !used));
  const keys = new Set([sx, sy, sz].filter(Boolean).map((s) => s.key));
  let mixed = null;
  if (keys.size > 1) {
    const whole = (used?.z ? used : null) || sets.find((s) => s.z && (s === sx || s === sy || s === sz)) || null; // X / Y's own set first
    mixed = { cols: [mapping.x, mapping.y, mapping.z].filter(Boolean), whole };
  }
  return { sets, used, others, mixed };
}

// the columns of the sets not used, to keep with each hole whatever their number of distinct values
export function unusedSetColumns(headers, mapping = {}) {
  const { others } = judgeCoordMapping(headers, mapping);
  const mapped = new Set(Object.values(mapping || {}).filter(Boolean));
  return others.flatMap((s) => [s.x, s.y, s.z]).filter((c) => c && !mapped.has(c));
}

// EPSG codes of UTM-type grids (false easting 500,000 m), where an easting under 100,000 m means another grid: WGS 84, NAD83, NAD27 and
// NAD83(CSRS) UTM, MGA (GDA94 / GDA2020), AMG (AGD84 / AGD66). Other projected systems (BC Albers, state planes) have other ranges.
export function isUtmLikeEpsg(epsg) {
  const e = Number(epsg);
  return (e >= 32601 && e <= 32660) || (e >= 32701 && e <= 32760) || (e >= 26901 && e <= 26923) || (e >= 26701 && e <= 26722)
    || (e >= 2955 && e <= 2962) || (e >= 3154 && e <= 3160) || (e >= 28348 && e <= 28358) || (e >= 7846 && e <= 7859)
    || (e >= 20348 && e <= 20358) || (e >= 20248 && e <= 20258);
}
