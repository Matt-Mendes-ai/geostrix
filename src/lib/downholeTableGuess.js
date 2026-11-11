// TASKS.csv #1722 (review #1645, Copley) — the outcrop importer took Copley's DOWNHOLE structure table (HOLEID, GEOLFROM, GEOLTO,
// Struc_Code, Struc_Alpha ...) as outcrop measurements, then said 'Pick at least easting, northing...'. A table with a hole id and
// down-hole depths and no easting / northing is a drillhole table: the outcrop importer says where it belongs instead.
const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HOLE = /^(holeid|hole|holeno|holename|bhid|dhid|ddh|ddhid|ddhno|drillhole|drillholeid|siteid)$/;
const FROM = /^(from|depthfrom|mfrom|fromm|geolfrom|sampfrom|strucfrom|structfrom)$/;
const TO = /^(to|depthto|mto|tom|geolto|sampto|structo|structto)$/;
const DEPTH = /^(depth|depthm|md|downholedepth|strucdepth|structdepth)$/;
const ANGLE = /(alpha|beta|tca|coreangle|anglecore)/;

// headers, the importer's guesses ({ x, y }) -> null, or { hole, from, to, depth, angles } naming the columns that make it a downhole table
export function downholeTableColumns(headers, guess = {}) {
  if (guess.x && guess.y) return null; // it has map coordinates: an outcrop table, whatever else it holds
  const hs = (headers || []).map((h) => ({ h, n: norm(h) }));
  const find = (re) => hs.find(({ n }) => re.test(n))?.h || null;
  const hole = find(HOLE), from = find(FROM), to = find(TO), depth = find(DEPTH);
  if (!hole || !((from && to) || depth)) return null;
  return { hole, from, to, depth, angles: hs.filter(({ n }) => ANGLE.test(n)).map(({ h }) => h) };
}

// #1722 — the outcrop importer's Type when no column is named like one: a structure code column (Struc_Code). Only there: in the 3D View's
// guess (layers.js guessMapping) it would make Copley's interval table 'structure' picks instead of structural zones (#604).
export const structureCodeColumn = (headers) => (headers || []).find((h) => { const n = norm(h); return /^struc(t|ture)?code$/.test(n) || (/struc/.test(n) && n.endsWith("code")); }) || null;

// TASKS.csv #2188 (review #2174, WA gold) — two structure-type columns (Linear_StrucType, blank in 357 of 366 rows, and Planar_StrucType,
// filled on all): the guess took the first by name. -> the type-like column with the most filled cells when the guess is one of several, else
// the guess. rows: the file's rows (a sample is enough)
export function fullestTypeColumn(headers, rows, guess) {
  if (!guess) return guess;
  const like = (headers || []).filter((h) => /struc.*type|type.*struc/i.test(String(h)));
  if (like.length < 2 || !like.includes(guess)) return guess;
  const filled = (h) => (rows || []).reduce((n, r) => n + (String(r?.[h] ?? "").trim() !== "" ? 1 : 0), 0);
  return like.reduce((best, h) => (filled(h) > filled(best) ? h : best), guess);
}
