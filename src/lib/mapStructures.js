// TASKS.csv #3590 (startup trim) — the structure-table column guessing and row parsing moved out of mapLayers.js verbatim: the startup chunk carries every export a lazily-loaded
// module imports from a module it also loads, so what only lazy code uses lives in its own file. mapLayers.js is unchanged otherwise.
import { gridXY } from "./gridColumns.js"; // TASKS.csv #2564

const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Guesses which CSV columns hold what. Order matters: "dip direction" must be claimed before "dip", and
// "Structure Type" (exact) before "Symbology Structure Type" (the sample file has both).
export function guessStructureColumns(headers) {
  const hs = headers.map((h) => ({ h, n: norm(h) }));
  const take = (tests, exclude = []) => {
    for (const t of tests) {
      const hit = hs.find(({ h, n }) => !exclude.includes(h) && t(n));
      if (hit) return hit.h;
    }
    return null;
  };
  // TASKS.csv #1605 (review #1497, Lawyers) — "dip1_conf" / "strike1_conf" (a confidence code) were taken for Dip and Strike by the
  // starts-with fallbacks: a column that describes a measurement is never the measurement
  const about = (n) => /conf|qual|err|accur|certain|method|flag|source/.test(n);
  const dipDir = take([(n) => n === "dipdirection" || n === "dipdir" || n === "ddir" || n === "dd" || n === "dipazimuth" || n === "dipaz", (n) => n.startsWith("dipdir") && !about(n), (n) => n === "azimuth" || n === "az"]); // "dd": TASKS.csv #426
  const dip = take([(n) => n === "dip", (n) => n.startsWith("dip") && !n.startsWith("dipdir") && !n.startsWith("dipaz") && !about(n)], [dipDir]);
  let x = take([(n) => n === "x" || n === "easting" || n === "east", (n) => n.startsWith("easting") || n.startsWith("east"), (n) => n.includes("easting"), (n) => n === "eutm" || n === "utme" || n === "utmeast"]); // e_utm: #1605 (40958Z)
  let y = take([(n) => n === "y" || n === "northing" || n === "north", (n) => n.startsWith("northing") || n.startsWith("north"), (n) => n.includes("northing"), (n) => n === "nutm" || n === "utmn" || n === "utmnorth"]);
  let z = take([(n) => n === "z" || n === "elev" || n === "elevation" || n === "rl" || n === "alt" || n === "altitude", (n) => n.startsWith("elev")]);
  // TASKS.csv #2564 — a grid-named pair (MGA_E / MGA_N / MGA_Z, GDA94_East ...) when no plain easting / northing is there
  const g = !x || !y ? gridXY(headers) : null;
  if (g) { if (!x) x = g.x; if (!y) y = g.y; if (!z && g.z) z = g.z; }
  const strike = take([(n) => n === "strike" || n === "strk", (n) => n.startsWith("strike") && !about(n)]);
  const type = take([(n) => n === "structuretype" || n === "type" || n === "structure", (n) => n.endsWith("structuretype"), (n) => n.includes("type")]);
  const comment = take([(n) => n === "comments" || n === "comment" || n === "notes" || n === "description", (n) => n.startsWith("comment")]);
  // TASKS.csv #1442 (review #1352) — the field station: it was dropped, so a symbol on the map or a row of the CSV / KML / GeoPackage
  // could not be traced back to the notebook
  const station = take([(n) => n === "station" || n === "stn" || n === "stationid" || n === "site" || n === "siteid" || n === "waypoint" || n === "wpt" || n === "pointid" || n === "id", (n) => n.startsWith("station")]);
  const dipQuad = take([(n) => n === "dipquadrant" || n === "dipquad" || n === "quadrant" || n === "dipq" || n === "dipsense" || n === "dipside"]); // #2083
  return { x, y, z, strike, dip, dipDir, type, comment, station, dipQuad };
}

// TASKS.csv #1826 (review #1646, Kodiak) — the station column: Appendix I's 'Waypoint' is filled only on the first sample of each chip series,
// blank on all 8 measured rows, while Sample_Number is filled on every row. Among the station-like and sample-number columns, the one filled
// on most rows that hold a dip; a tie keeps the name guess. -> a header or null
export function bestStationColumn(headers, rows, guess = {}) {
  const isStation = (n) => n === "station" || n === "stn" || n === "stationid" || n === "site" || n === "siteid" || n === "waypoint" || n === "wpt" || n === "pointid" || n.startsWith("station");
  const isSample = (n) => /^(sample|samplenumber|sampleno|sampleid|samplenum|sampno|sampid|sampnum)$/.test(n);
  const cands = (headers || []).filter((h) => { const n = norm(h); return isStation(n) || isSample(n) || h === guess.station; });
  if (!cands.length) return guess.station || null;
  const measured = (rows || []).filter((r) => guess.dip && String(r?.[guess.dip] ?? "").trim() !== "");
  const base = measured.length ? measured : rows || [];
  const fill = (h) => base.reduce((k, r) => k + (String(r?.[h] ?? "").trim() !== "" ? 1 : 0), 0);
  let best = guess.station && cands.includes(guess.station) ? guess.station : cands[0], bf = fill(best);
  for (const h of cands) { const f = fill(h); if (f > bf) { best = h; bf = f; } }
  return bf > 0 ? best : guess.station || null;
}

// Normalizes a structure type string to a short canonical class used for colouring and filtering.
// TASKS.csv #2082 (review #2013, Surface Geology) — the drillhole logs' own abbreviations (FLT, FLTG, FLTBX, FRAC, CF, BRX…, BC acQuire style) all
// fell into 'Other' because only whole words were tested: a code (or its first token) is read first, then the words as before.
// TASKS.csv #2266 (review #2174, WA lode gold) — that log's SH / SC (shear, S-C fabric), the VN* family (VNM, VNS, VNX, VNQ…), CNL (crenulation),
// SO (S-zero) and DYK all fell into Other: added. A code no rule knows can be given a class per project on the import card (codeClasses).
const CODE_CLASS = [
  [/^(flt\w*|fz|flz|sh|shr|shz|shear\w*|sz|sc|scz|gge|gouge)$/, "fault"],
  [/^(bx|brx|bxx|brec\w*)$/, "breccia"],
  [/^(vn\w*|vbr|qv|qzv|qtzv|vein\w*)$/, "vein"],
  [/^(cf|con|cont|ctc|ctct|dyk|dyke|dk)$/, "contact"],
  [/^(frac\w*|fr|frx|jt|jnt|jts)$/, "joint"],
  [/^(bd|bdg|bed\w*|ss0|s0|so)$/, "bedding"],
  [/^(fol|fo|s1|s2)$/, "foliation"],
  [/^(clv|clvg|cnl|cren\w*|crn|s3)$/, "cleavage"],
];
export const STRUCTURE_CLASSES = ["fault", "breccia", "vein", "contact", "joint", "bedding", "foliation", "cleavage", "other"];
// The key a per-project class choice is stored under: the type as written, trimmed and upper-cased
export const structureCodeKey = (t) => String(t ?? "").trim().toUpperCase();
export function structureClass(t, codeClasses = null) {
  const own = codeClasses && codeClasses[structureCodeKey(t)]; // #2266 — the project's own choice first
  if (own && STRUCTURE_CLASSES.includes(own)) return own;
  const s = String(t || "").toLowerCase();
  const first = s.trim().split(/[^a-z0-9]+/).filter(Boolean)[0] || "";
  for (const [re, cls] of CODE_CLASS) if (re.test(first)) return cls; // #2082
  if (/fault|shear/.test(s)) return "fault";
  if (/breccia/.test(s)) return "breccia"; // #2082
  if (/bed/.test(s)) return "bedding";
  if (/foli|schist/.test(s)) return "foliation";
  if (/cleav/.test(s)) return "cleavage";
  if (/contact|dyke|dike/.test(s)) return "contact";
  if (/vein/.test(s)) return "vein";
  if (/joint|fract/.test(s)) return "joint";
  return "other";
}

// CSV rows -> [{ x, y, z (null when blank), dip, dipDir, strike, type, cls, comment }]. Dip direction is
// taken as recorded when present; otherwise derived from strike with the right-hand rule (dip direction
// = strike + 90), the convention BC assessment reports use. Returns { rows, skipped, derivedFromStrike,
// rhrMismatches } — a mismatch is a row whose recorded strike and dip direction don't differ by 90°,
// reported (not corrected) because it usually means a left-hand-rule strike or a typo, and only the
// geologist knows which.
export function parseStructureRows(rawRows, cols, codeClasses = null) {
  // TASKS.csv #430 — the old /[^\d.+-eE]/ held a RANGE '+'..'e' (digits, capitals, a-e), so "65 deg" became
  // "65de" and "dip 65" "dip65" and both were skipped. Strip degree marks and a leading label only; anything
  // else that isn't a plain number (e.g. quadrant "N45E") still counts as skipped, never guessed.
  const num = (v) => {
    if (v == null || v === "") return null;
    const s = String(v).trim().replace(/[°º]|deg(?:rees?)?\.?/gi, "").replace(/^(?:dip\s*dir(?:ection)?|dip|az(?:imuth)?|strike|x|y|z)\s*[:=]?\s*/i, "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const rows = [];
  // TASKS.csv #2083 (review #2013, Surface Geology) — a strike-only file was always read by the right-hand rule: a left-hand-rule notebook
  // imported every plane facing 180° the wrong way, unseen. cols.strikeRule 'rhr' (dip direction = strike + 90, the default) or 'lhr'
  // (strike - 90); cols.dipQuad, a column of dip quadrants (N, NE, E… or 'SW'), settles each row by the side the plane dips to.
  const rule = cols.strikeRule === "lhr" ? "lhr" : "rhr", offset = rule === "lhr" ? 270 : 90;
  const QUAD = { n: 0, nne: 22.5, ne: 45, ene: 67.5, e: 90, ese: 112.5, se: 135, sse: 157.5, s: 180, ssw: 202.5, sw: 225, wsw: 247.5, w: 270, wnw: 292.5, nw: 315, nnw: 337.5 };
  const angDiff = (a, b) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return Math.min(d, 360 - d); };
  let skipped = 0, derivedFromStrike = 0, rhrMismatches = 0, fromQuadrant = 0, quadrantUnread = 0, horizontal = 0;
  // TASKS.csv #2958 (WA iron review) — a horizontal reading (dip 0, or 'flat' / 'horizontal' in the dip column) has no dip direction: it was
  // skipped as 'a dip but no dip direction', so a flat-lying field kept only the beds that dip and every mean came out steeper. It is kept
  // as dip 0, dipDir 0 (any direction is the same plane; its pole is vertical) with horizontal: true, so the disc and Identify say so.
  const FLAT = /^(flat|horizontal|horiz\.?|hz|hor\.?)$/i;
  const skipNames = { noDirection: [] }; // #2958 — the rows skipped for a dip with no direction, named in the notice
  // TASKS.csv #2093 / #1826 — each skipped row counted by its reason: 'missing coordinates or a valid 0-90 dip' lumped a quadrant bearing,
  // a missing dip, a dip of 95, a missing easting and the 50 rows of a rock sheet that simply hold no structure
  const skipWhy = { noMeasurement: 0, noXY: 0, noDip: 0, badDip: 0, bearingUnread: 0, noDirection: 0 };
  const blank = (v) => v == null || String(v).trim() === "";
  const skip = (why) => { skipped++; skipWhy[why]++; };
  rawRows.forEach((r, ri) => {
    const x = num(r[cols.x]), y = num(r[cols.y]);
    let dip = num(r[cols.dip]);
    if (dip == null && FLAT.test(String(r[cols.dip] ?? "").trim())) dip = 0; // #2958
    let dipDir = cols.dipDir ? num(r[cols.dipDir]) : null;
    const strike = cols.strike ? num(r[cols.strike]) : null;
    const rawDip = r[cols.dip], rawDir = cols.dipDir ? r[cols.dipDir] : null, rawStrike = cols.strike ? r[cols.strike] : null;
    if (blank(rawDip) && blank(rawDir) && blank(rawStrike)) { skip("noMeasurement"); return; }
    if (x == null || y == null) { skip("noXY"); return; }
    if (blank(rawDip)) { skip("noDip"); return; }
    if (dip == null || dip < 0 || dip > 90) { skip("badDip"); return; }
    let flat = false;
    if (dipDir == null && strike == null && dip === 0 && blank(rawDir) && blank(rawStrike)) { dipDir = 0; flat = true; horizontal++; } // #2958
    if (dipDir == null) {
      if (strike == null) {
        const why = !blank(rawDir) || !blank(rawStrike) ? "bearingUnread" : "noDirection";
        if (why === "noDirection") skipNames.noDirection.push((cols.station && String(r[cols.station] ?? "").trim()) || `row ${ri + 2}`);
        skip(why); return;
      }
      const q = cols.dipQuad ? String(r[cols.dipQuad] ?? "").trim().toLowerCase() : "";
      if (q && q in QUAD) { const a = (strike + 90) % 360, b = (strike + 270) % 360; dipDir = angDiff(a, QUAD[q]) <= angDiff(b, QUAD[q]) ? a : b; fromQuadrant++; }
      else { if (q) quadrantUnread++; dipDir = (strike + offset) % 360; derivedFromStrike++; }
    } else if (strike != null) {
      const d = Math.abs((((dipDir - strike) % 360) + 360) % 360 - offset);
      if (d > 2 && d < 358) rhrMismatches++;
    }
    const type = cols.type ? String(r[cols.type] ?? "") : "";
    rows.push({ x, y, z: cols.z ? num(r[cols.z]) : null, dip, dipDir: ((dipDir % 360) + 360) % 360, strike, type, cls: structureClass(type, codeClasses), ...(flat ? { horizontal: true } : {}), ...(cols.station ? { station: String(r[cols.station] ?? "").trim() } : {}), comment: cols.comment ? String(r[cols.comment] ?? "") : "" });
  });
  return { rows, skipped, skipWhy, skipNames, horizontal, derivedFromStrike, rhrMismatches, fromQuadrant, quadrantUnread, strikeRule: rule };
}

