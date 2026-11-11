// TASKS.csv #1345 (ARIS 42807Z / 42616Z) — a collar file that names its coordinate system in its column headers
// ("NAD83_9N_SUR_X", "UTM East NAD83_U10"): the CRS question opens with that answer already chosen. Only the systems a
// header can name without doubt: NAD83 / NAD27 UTM north (North America) and WGS 84 UTM with its hemisphere. A CSRS
// realisation is not guessed (its zones do not follow one numbering). -> EPSG code or null; null when headers disagree.
// TASKS.csv #2155 / #2156 / #2181 (WA drillhole and WA gold reviews) — a collar file that names its grid in its VALUES: GRIDNAME = MGA94_51,
// NAT_Grid_ID = MGA94_Z50, Datum + Zone, COORDSYS = GDA94_51S, LL_Grid_ID = LL_WGS84, or a local grid (MINE, PAN, WALLABY). Every test
// project asked the CRS question although the file said MGA94_51. One grid name -> EPSG; a name no system matches -> a local grid;
// rows in several frames (5 MGA94_51 + 3 WALLABY) are said, never averaged.
const GRID_NAME_COLS = /^(grid_?name|grid|grid_?id|nat_?grid_?id|mga_?grid_?id|ll_?grid_?id|map_?grid|coord_?sys(tem)?|coordinate_?system|crs_?name|datum|projection|proj|zone|utm_?zone)$/;
const normCol = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
export function epsgFromGridName(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[\s_.\-/]+/g, " ").trim();
  const geo = /^(LL|LATLONG|LATLON|GEO(GRAPHIC)?|LONLAT)\b|\b(LL|LAT ?LONG?|GEOGRAPHIC)$/.test(s);
  const datum = /GDA ?2020|MGA ?2020/.test(s) ? "GDA2020" : /GDA ?94|MGA ?94|\bMGA\b|\bGDA\b/.test(s) ? "GDA94" : /AGD ?84|AMG ?84/.test(s) ? "AGD84"
    : /AGD ?66|AMG ?66/.test(s) ? "AGD66" : /\bAMG\b/.test(s) ? "AMG?" : /WGS ?84/.test(s) ? "WGS84" : /NAD ?83/.test(s) ? "NAD83" : /NAD ?27/.test(s) ? "NAD27" : null;
  if (geo || (datum && !/\d/.test(s.replace(/GDA ?2020|MGA ?2020|GDA ?94|MGA ?94|AGD ?84|AMG ?84|AGD ?66|AMG ?66|WGS ?84|NAD ?83|NAD ?27/g, "")) && /^(LL |GEO)/.test(s))) {
    const g = { GDA2020: 7844, GDA94: 4283, AGD84: 4203, AGD66: 4202, WGS84: 4326, NAD83: 4269, NAD27: 4267 }[datum || "WGS84"];
    return g ? { epsg: g } : { unknown: true };
  }
  if (!datum) return /UTM|\bZONE\b|\bZ ?\d\d\b/.test(s) ? { unknown: true } : { local: true };
  const rest = s.replace(/GDA ?2020|MGA ?2020|GDA ?94|MGA ?94|AGD ?84|AMG ?84|AGD ?66|AMG ?66|WGS ?84|NAD ?83|NAD ?27|\bMGA\b|\bGDA\b|\bAMG\b|\bUTM\b/g, " ");
  const m = /(?:^|\D)Z?(?:ONE)? ?(\d{1,2}) ?([NS])?(?!\d)/.exec(rest);
  const zone = m ? Number(m[1]) : null, hemi = m?.[2] || null;
  if (datum === "AMG?") return { unknown: true, why: "amg" }; // AMG zone with no 66 / 84: the datum is not known
  if (!zone) return { unknown: true };
  const range = { GDA2020: [46, 59, 7800], GDA94: [48, 58, 28300], AGD84: [49, 56, 20300], AGD66: [49, 58, 20200] }[datum];
  if (range) return zone >= range[0] && zone <= range[1] ? { epsg: range[2] + zone } : { unknown: true };
  if (datum === "WGS84") return zone >= 1 && zone <= 60 && hemi ? { epsg: (hemi === "S" ? 32700 : 32600) + zone } : { unknown: true };
  if (datum === "NAD83" && zone >= 1 && zone <= 23) return { epsg: 26900 + zone };
  if (datum === "NAD27" && zone >= 1 && zone <= 22) return { epsg: 26700 + zone };
  return { unknown: true };
}
// -> null (no grid column), or { cols, groups: [{ name, rows, epsg, local, unknown }], epsg (one frame named), mixed, local (all local) }
export function gridFrameFromRows(headers, rows) {
  const cols = (headers || []).filter((h) => GRID_NAME_COLS.test(normCol(h)));
  if (!cols.length) return null;
  const by = new Map();
  for (const r of rows || []) {
    const name = cols.map((c) => String(r?.[c] ?? "").trim()).filter(Boolean).join(" ");
    if (!name) continue;
    if (!by.has(name)) by.set(name, { name, rows: 0, ...(epsgFromGridName(name) || {}) });
    by.get(name).rows++;
  }
  if (!by.size) return null;
  const groups = [...by.values()].sort((a, b) => b.rows - a.rows);
  // frames: an EPSG code, or the local grid's own name; two spellings of one EPSG are one frame
  const frames = new Set(groups.map((g) => (g.epsg ? `E${g.epsg}` : `N${g.name.toUpperCase()}`)));
  return { cols, groups, epsg: frames.size === 1 && groups[0].epsg ? groups[0].epsg : null, mixed: frames.size > 1, local: groups.every((g) => g.local) };
}
// #2156 — eastings no UTM / MGA zone has (false easting 500,000 m: about 166,000 to 834,000 m), or no hemisphere's northings: a local grid
export function smallGridCoordinates(points) {
  const ps = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (Math.abs(p.x) > 360 || Math.abs(p.y) > 360));
  if (!ps.length) return null;
  const small = ps.filter((p) => p.x < 100000 || p.x > 900000 || p.y < 0 || p.y > 10000000);
  if (small.length < ps.length / 2) return null;
  const xs = small.map((p) => p.x), ys = small.map((p) => p.y);
  return { n: small.length, of: ps.length, x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
}

// TASKS.csv #2495 (review #2486, WA lithium) — coordinate columns named after a grid FAMILY with no zone (MGA_E / MGA_N, AMG84_East,
// Easting_GDA2020): the CRS question said "A collar CSV doesn't say which CRS it is in" and offered no MGA zone until a latitude and
// longitude were typed. -> null, or { grid: "MGA" | "AMG", cols, datums, zone, codes } : the EPSG codes the columns allow (zones 49-56
// unless the header names one), datum by datum. A bare MGA / GDA prefix allows both GDA94 and GDA2020, a bare AMG / AGD both AGD66 and
// AGD84: the file cannot tell them apart, so the datum stays the user's choice. Columns naming two families (MGA and AMG) -> null.
const FAMILY_AXIS = "(E|N|X|Y|Z|RL|EAST|NORTH|EASTING|NORTHING|ELEV|ELEVATION|RL_?M|Z_?M)";
const FAMILY_HEAD = new RegExp(`^(MGA|GDA|AMG|AGD)(94|2020|84|66)?_?(?:Z(?:ONE)?_?)?(\\d{2})?_?${FAMILY_AXIS}$`);
const FAMILY_TAIL = new RegExp(`^${FAMILY_AXIS}_(MGA|GDA|AMG|AGD)(94|2020|84|66)?(?:_?Z(?:ONE)?_?(\\d{2}))?$`);
const FAMILY_CODE = { GDA94: 28300, GDA2020: 7800, AGD84: 20300, AGD66: 20200 };
export function crsFamilyFromColumns(headers) {
  const hits = [];
  for (const h of headers || []) {
    const s = String(h ?? "").trim().toUpperCase().replace(/[\s.-]+/g, "_");
    let m = FAMILY_HEAD.exec(s), fam, ver, zone;
    if (m) [, fam, ver, zone] = m;
    else if ((m = FAMILY_TAIL.exec(s))) [, , fam, ver, zone] = m;
    else continue;
    const grid = fam === "MGA" || fam === "GDA" ? "MGA" : "AMG";
    const datums = grid === "MGA" ? (ver === "94" ? ["GDA94"] : ver === "2020" ? ["GDA2020"] : ver ? null : ["GDA2020", "GDA94"])
      : ver === "84" ? ["AGD84"] : ver === "66" ? ["AGD66"] : ver ? null : ["AGD84", "AGD66"];
    if (!datums) continue; // MGA84, AMG2020: no such grid
    hits.push({ col: String(h), grid, datums, zone: zone ? Number(zone) : null });
  }
  if (!hits.length || new Set(hits.map((x) => x.grid)).size > 1) return null;
  // the datums every column allows (MGA94_E with MGA_N: GDA94); a zone named by any column, if they agree
  let datums = hits[0].datums;
  for (const x of hits) datums = datums.filter((d) => x.datums.includes(d));
  const zones = [...new Set(hits.map((x) => x.zone).filter((z) => z != null))];
  if (!datums.length || zones.length > 1) return null;
  const zone = zones[0] ?? null;
  if (zone != null && (zone < 49 || zone > 56)) return null;
  const zs = zone != null ? [zone] : [49, 50, 51, 52, 53, 54, 55, 56];
  const codes = zs.flatMap((z) => datums.map((d) => FAMILY_CODE[d] + z));
  return { grid: hits[0].grid, cols: hits.map((x) => x.col), datums, zone, codes };
}

export function epsgFromColumns(headers) {
  const found = new Set();
  for (const h of headers || []) {
    const s = String(h ?? "").toUpperCase().replace(/[\r\n]+/g, " ");
    if (/CSRS/.test(s)) continue;
    let m = s.match(/NAD\s*_?83[\s_-]*(?:UTM[\s_-]*)?(?:Z(?:ONE)?[\s_-]*)?U?(\d{1,2})\s*N?(?![\dA-Z])/);
    if (m && +m[1] >= 1 && +m[1] <= 23) { found.add(26900 + +m[1]); continue; }
    m = s.match(/NAD\s*_?27[\s_-]*(?:UTM[\s_-]*)?(?:Z(?:ONE)?[\s_-]*)?U?(\d{1,2})\s*N?(?![\dA-Z])/);
    if (m && +m[1] >= 1 && +m[1] <= 22) { found.add(26700 + +m[1]); continue; }
    m = s.match(/WGS\s*_?84[\s_-]*(?:UTM[\s_-]*)?(?:Z(?:ONE)?[\s_-]*)?(\d{1,2})\s*([NS])(?![A-Z])/);
    if (m && +m[1] >= 1 && +m[1] <= 60) found.add((m[2] === "N" ? 32600 : 32700) + +m[1]);
  }
  return found.size === 1 ? [...found][0] : null;
}
