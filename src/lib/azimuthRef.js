// TASKS.csv #396 — azimuth reference (grid / true / magnetic north) for imported azimuths.
//
// GeoStrix draws every azimuth against the PROJECT GRID's north. Survey and structure azimuths are often
// recorded against magnetic north (compass, some downhole tools) or true north (gyro), and nothing used to
// correct them: at Harry the declination is about +17 deg (IGRF-14, 2026), which puts the toe of a 632 m
// hole at -65 deg roughly 80 m off, and outcrop measurements and the alpha/beta calibration inherited the
// same error. The user now says which north the file's azimuths use; this converts them to grid north.
//
//   grid azimuth = true azimuth + c            (c = bearing of true north measured in the grid, "convergence")
//   grid azimuth = magnetic azimuth + D + c    (D = magnetic declination, east positive, IGRF-14 at the date)
//
// Pure: reprojection + IGRF only, no UI. Returns null when the location can't be converted (no project
// CRS, or a CRS proj4 doesn't know) so the caller can say so instead of guessing.
import { reprojectXY } from "./reproject.js";
// TASKS.csv #552 — IGRF (20 kB of coefficients) is needed only for MAGNETIC azimuths, so it isn't a static import:
// loadIgrf() fetches it (the import pipeline awaits it before converting magnetic azimuths), and a lazily-loaded
// module that imports igrf.js itself can hand it over with setIgrfModule(). Without it, a magnetic conversion throws
// rather than silently returning a grid-only answer.
let igrf = null;
export const setIgrfModule = (mod) => { igrf = mod; };
export const loadIgrf = () => (igrf ? Promise.resolve(igrf) : import("./igrf.js").then((m) => (igrf = m)));
import { trueNorthBearingInGridDeg } from "./gridConvergence.js"; // TASKS.csv #3159: not inversion.js, which put the inversion helpers in startup
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

export const AZIMUTH_REFS = {
  grid: "Grid north (the project's grid, or the grid of the CRS given here)",
  true: "True north (e.g. gyro surveys)",
  magnetic: "Magnetic north (compass / magnetic tools) — needs the survey date",
};

// TASKS.csv #1647 (review #1645, Copley) — a column saying which north the azimuths use (acQuire's AZIMUTHTYPE = True on a gyro
// survey) was never read: Copley's true-north survey went in as grid north, every trace turned 1.45° and the hole ends moved
// 4-6 m, with no question asked. -> { ref: "grid" | "true" | "magnetic", col, mixed } from the rows' values, or null with no
// such column (or no value it recognizes). mixed: more than one north in the file (the dialog must ask).
const AZ_REF_COLS = ["azimuthtype", "azimuth_type", "aztype", "az_type", "azimuthref", "azimuth_ref", "azref", "az_ref", "northref", "north_ref", "northtype", "north_type", "azimuthnorth", "azimuth_north"];
const azRefOf = (v) => {
  const s = String(v ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s) return null;
  if (/^(t|tn|true|truenorth|geographic|geo)$/.test(s)) return "true";
  if (/^(g|gn|grid|gridnorth|utm|map)$/.test(s)) return "grid";
  if (/^(m|mn|mag|magnetic|magneticnorth)$/.test(s)) return "magnetic";
  return null;
};
// TASKS.csv #2015 (review #2013, Import) — an MX Deposit / acQuire survey sheet states its north through CORRECTED azimuth columns
// (azimuth, azimuth_corrected_tn, azimuth_corrected_gn) and the instrument (gyro / compass), not an AZIMUTHTYPE column: Woodjam's
// sheet went in as grid north 'the file does not say which north', and its true-north gyro azimuths turned 1.29°.
// A filled grid column is read as grid north; else a filled true-north column is read and converted; a corrected column filled on
// only some rows is a mix (the dialog asks); with neither, an instrument column of gyros only is a hint of true north (the dialog
// opens with it pre-set; nothing is converted unseen). -> adds azimuthCol (the column to read) and hint.
// TASKS.csv #2154 (WA drillhole review) — the north is often only in the column's NAME: a map grid (AMG_AZIMUTH, MGA_Azimuth, Azimuth_UTM,
// GDA94_Azi) is grid north, Azimuth_MAG magnetic north. Lithium / nickel / iron files went in as grid north with their true or magnetic azimuths.
const GN_COLS = /^(azimuth|azi|az)[\s_-]*(corrected[\s_-]*)?(gn|grid|utm|mga|amg|gda|map)\d*$|^(grid|utm|mga|amg|gda|map)\d*[\s_-]*(azimuth|azi|az)$/i;
const MN_COLS = /^(azimuth|azi|az)[\s_-]*(mag|magnetic|mn)$|^(mag|magnetic)[\s_-]*(azimuth|azi|az)$/i;
// #2154 — WAMEX's AZIMUTHGRIDNAME: the grid the azimuths are measured in (MGA94_51, AMG84_51, LOCAL); a north word is read as such
const GRID_NAME_COLS = /^(azimuth|azi|az)[\s_-]*grid[\s_-]*name$/i;
const TN_COLS = /^(azimuth|azi|az)[\s_-]*(corrected[\s_-]*)?(tn|true)$|^true[\s_-]*(azimuth|azi|az)$/i;
// TASKS.csv #3209 (#3195, Galore Creek) — 'SURVTYPE' (CHAMPGYRO on 593 stations) was not read as the instrument, so a dropped folder's gyro survey
// went in as grid north unasked: surv / survey type, method, tool, instrument
const INSTRUMENT_COLS = /^(instrument|surv(ey)?[\s_-]*(tool|instrument|method|type|inst)|tool|method)$/i;
// #3209 — magnetic downhole tools by name (a gyro word wins: 'Reflex Gyro' is a gyro)
const MAGNETIC_TOOL = /reflex|ez[\s_-]*(shot|trac)|multi[\s_-]*shot|single[\s_-]*shot|compass|eastman|tropari|devi[\s_-]*shot|magnetic/;
function correctedColumns(headers, rows) {
  const hs = headers || [];
  const filled = (c) => { let n = 0, all = 0; for (const r of rows || []) { all++; const v = r?.[c]; if (v != null && String(v).trim() !== "" && Number.isFinite(Number(v))) n++; } return { n, all }; };
  // #2154 — every named column with values, in this order of preference: grid, true, magnetic. Two of them: the first is read and the
  // others are listed (`also`), so the dialog can say which one was taken
  const named = [];
  for (const [re, ref] of [[GN_COLS, "grid"], [TN_COLS, "true"], [MN_COLS, "magnetic"]]) {
    const col = hs.find((h) => re.test(String(h).trim()));
    if (!col) continue;
    const { n, all } = filled(col);
    if (n) named.push({ col, ref, n, all }); // an empty corrected column says nothing
  }
  if (named.length) {
    const { col, ref, n, all } = named[0];
    if (n < all) return { ref: null, col, mixed: true, azimuthCol: null, partial: { col, n, all } };
    // a plain Azimuth beside a named one is the raw reading the named one corrects (MX / acQuire sheets, #2015): not a rival
    const also = named.slice(1).map((x) => ({ col: x.col, ref: x.ref }));
    return { ref, col, mixed: false, azimuthCol: col, ...(also.length ? { also } : {}) };
  }
  const inst = hs.find((h) => INSTRUMENT_COLS.test(String(h).trim()));
  if (inst) {
    const kinds = new Set();
    for (const r of rows || []) { const s = String(r?.[inst] ?? "").trim().toLowerCase(); if (s) kinds.add(/gyro/.test(s) ? "gyro" : MAGNETIC_TOOL.test(s) ? "magnetic" : "other"); }
    if (kinds.size === 1 && kinds.has("gyro")) return { ref: "true", col: inst, mixed: false, hint: true };
    // #3209 — magnetic tools only: a hint of magnetic north (the dialog opens with it, and asks the date); gyro and magnetic tools in one file: the
    // dialog asks which north, and says why
    if (kinds.size === 1 && kinds.has("magnetic")) return { ref: "magnetic", col: inst, mixed: false, hint: true };
    if (kinds.has("gyro") && kinds.has("magnetic")) return { ref: null, col: inst, mixed: true, hint: true, tools: true };
  }
  return null;
}

export function detectAzimuthRef(headers, rows) {
  const col = (headers || []).find((h) => AZ_REF_COLS.includes(String(h).trim().toLowerCase()));
  if (!col) {
    // #2154 — a grid-name column: any filled value means grid azimuths (in that grid), unless it is a north word
    const gcol = (headers || []).find((h) => GRID_NAME_COLS.test(String(h).trim()));
    if (gcol) {
      const seen = new Set();
      for (const r of rows || []) { const v = String(r?.[gcol] ?? "").trim(); if (v) seen.add(azRefOf(v) || "grid"); }
      if (seen.size) {
        const byName = correctedColumns(headers, rows);
        if (byName?.azimuthCol && byName.ref !== "grid") return byName; // a true / magnetic column's own name says more
        return { ref: seen.size === 1 ? [...seen][0] : null, col: gcol, mixed: seen.size > 1, ...(byName?.azimuthCol ? { azimuthCol: byName.azimuthCol } : {}) };
      }
    }
    return correctedColumns(headers, rows); // #2015
  }
  const seen = new Set();
  for (const r of rows || []) { const ref = azRefOf(r?.[col]); if (ref) seen.add(ref); }
  if (!seen.size) return null;
  return { ref: seen.size === 1 ? [...seen][0] : null, col, mixed: seen.size > 1 };
}

// Degrees to ADD to an azimuth measured from `ref` at project coordinates (x, y) to get a grid azimuth.
// { offset, declination?, convergence? } or null.
export function azimuthToGridOffset(ref, x, y, epsg, isoDate) {
  if (!ref || ref === "grid") return { offset: 0 };
  if (!Number.isFinite(x) || !Number.isFinite(y) || !epsg) return null;
  const convergence = trueNorthBearingInGridDeg(x, y, epsg);
  if (convergence == null || !Number.isFinite(convergence)) return null;
  if (ref === "true") return { offset: convergence, convergence };
  if (ref === "magnetic") {
    if (!igrf) throw new Error(tr("azimuthToGridOffset: magnetic north needs loadIgrf() first"));
    const year = igrf.decimalYear(String(isoDate || ""));
    if (!Number.isFinite(year)) return null;
    const ll = reprojectXY(x, y, epsg, 4326);
    if (!ll) return null;
    let f;
    try { f = igrf.igrfField(ll.x, ll.y, 0, year); } catch { return null; } // outside IGRF's 1900-2030 range
    return { offset: f.declination + convergence, declination: f.declination, convergence };
  }
  return null;
}

export const wrap360 = (a) => ((a % 360) + 360) % 360;

// TASKS.csv #1024 (review #1016) — a GRID bearing at (x, y) as the true and magnetic bearings a crew walks with a
// compass: { grid, true, magnetic, declination, convergence, date } (degrees, 0.1), magnetic null when IGRF cannot give
// one (no date, outside 1900-2030). null when the location cannot be converted. Magnetic needs loadIgrf() first.
export function gridBearingAsTrueMagnetic(gridAz, x, y, epsg, isoDate) {
  const t = azimuthToGridOffset("true", x, y, epsg);
  if (!t) return null;
  let m = null;
  try { m = azimuthToGridOffset("magnetic", x, y, epsg, isoDate); } catch { m = null; }
  const r1 = (a) => Math.round(wrap360(a) * 10) / 10;
  return { grid: r1(gridAz), true: r1(gridAz - t.offset), magnetic: m ? r1(gridAz - m.offset) : null, declination: m ? Math.round(m.declination * 100) / 100 : null, convergence: Math.round(t.convergence * 100) / 100, date: m ? isoDate : null };
}
// "lines at 0° grid (359.5° true, 342.2° magnetic on 2026-10-27, IGRF-14)" — English, for the exported files
export function bearingPhrase(b, gridAz) {
  if (!b) return `${gridAz}° grid`;
  return `${b.grid}° grid (${b.true}° true${b.magnetic != null ? `, ${b.magnetic}° magnetic on ${b.date}, IGRF-14` : ""})`;
}

// TASKS.csv #547 — outcrop measurements (dip direction + strike, with their own project-CRS x / y) converted from
// true or magnetic north to grid north, per location (100 m cells share an offset, < 0.01° apart). Mutates nothing:
// returns { rows, converted, failed, example } where example = the first location's { offset, declination?, convergence }.
// Magnetic needs loadIgrf() first (azimuthToGridOffset throws otherwise).
export function bearingsToGrid(rows, ref, epsg, isoDate) {
  if (!ref || ref === "grid") return { rows, converted: 0, failed: 0, example: null };
  const cache = new Map();
  let converted = 0, failed = 0, example = null;
  const out = rows.map((r) => {
    if (!Number.isFinite(r.dipDir) && !Number.isFinite(r.strike)) return r;
    if (r.horizontal) return r; // TASKS.csv #3381 — a flat bed (#2958) has no direction: its stored dip direction 0 was turned to 20.29 (a strike of 290.29 in the export)
    const key = `${Math.round(r.x / 100)},${Math.round(r.y / 100)}`;
    let o = cache.get(key);
    if (o === undefined) { o = azimuthToGridOffset(ref, r.x, r.y, epsg, isoDate); cache.set(key, o); }
    if (!o) { failed++; return r; }
    converted++; if (!example) example = o;
    const turn = (a) => (Number.isFinite(a) ? Math.round(wrap360(a + o.offset) * 100) / 100 : a);
    return { ...r, dipDir: turn(r.dipDir), strike: turn(r.strike) };
  });
  return { rows: out, converted, failed, example };
}

// "magnetic north (IGRF-14 at 2021-06-19: declination +16.9°, grid convergence -1.2°)" for notices
export function northRefText(ref, isoDate, example) {
  const s = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`;
  // TASKS.csv #2900 (2) — 'grid convergence +1.14°' read as the usual surveying sign is the wrong way round (here grid = true + 1.14:
  // grid north is 1.14° WEST of true north): said as a direction, not a signed angle
  const gn = (c) => (c >= 0 ? tr("grid north {d}° west of true north", { d: Math.abs(c).toFixed(2) }) : tr("grid north {d}° east of true north", { d: Math.abs(c).toFixed(2) }));
  if (ref === "magnetic") return tr("magnetic north (IGRF-14 at {isoDate}{v})", { isoDate, v: example ? tr(": declination {v}, {gn}", { v: s(example.declination), gn: gn(example.convergence) }) : "" });
  if (ref === "true") return tr("true north{v}", { v: example ? ` (${gn(example.convergence)})` : "" });
  return tr("grid north");
}
