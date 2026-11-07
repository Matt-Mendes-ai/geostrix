// TASKS.csv — Geosoft (Oasis montaj) file format import, added after a survey of a real 787-file
// Oasis montaj sample dataset (see TASKS.csv note for the full list of what was/wasn't tractable).
// Both formats here were reverse-engineered directly from real sample files, not guessed from
// extension or vendor docs — .ply is Geosoft's own boundary/polygon format (NOT Stanford's unrelated
// mesh format that shares the extension by coincidence), .xyz is Geosoft's ASCII line/profile data
// export (airborne geophysics, ground surveys, etc.), both plain text with no public spec beyond
// "what real exported files actually look like".

import { parseClock } from "./diurnal.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

// ---------------------------------------------------------------------------------------------
// .ply — Geosoft boundary/polygon format. Real samples show two shapes: (1) an optional block of
// "/#KEY=value" metadata comment lines (CoordinateSystem/Datum/Projection/Units/LocalDatum) followed
// by one-or-more "poly N" section headers, each introducing a run of "X Y" vertex lines; or (2) just
// bare "X Y" vertex lines with no header and no poly markers at all (a single implicit boundary) —
// both are handled by the same loop: a new polyline starts at the first "poly N" line seen, or
// lazily at the first vertex line if no "poly N" ever appears. Real files are inconsistent about
// closing the loop (repeating the first vertex as the last) — the caller renders every boundary as a
// closed loop regardless, which is the more useful default for a property/survey boundary either way.
export function parsePLYBoundary(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const meta = {};
  const polylines = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("/#")) {
      const m = line.slice(2).match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m) meta[m[1]] = m[2];
      continue;
    }
    if (/^poly\s+\d+/i.test(line)) {
      current = [];
      polylines.push(current);
      continue;
    }
    const toks = line.split(/\s+/);
    if (toks.length >= 2) {
      const x = parseFloat(toks[0]), y = parseFloat(toks[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (!current) { current = []; polylines.push(current); }
        current.push({ x, y });
      }
    }
  }
  const usable = polylines.filter((p) => p.length > 1);
  if (!usable.length) {
    throw new Error(tr("No usable boundary vertices found — expected whitespace-separated \"X Y\" lines (Geosoft .ply format)."));
  }
  return { meta, polylines: usable };
}

// ---------------------------------------------------------------------------------------------
// .xyz — Geosoft ASCII line/profile data. Real samples (e.g. an airborne EM survey export) show:
// a "/"-prefixed column-header line (tokens after the leading "/" are the column names, in order);
// a "/"-prefixed "====...===='" underline/separator row right after it; occasional lone "/" comment
// lines; "//"-prefixed plain comments (Flight/Date metadata, informational only); "Line  NNNN" marker
// lines that start a new flight-line/traverse — everything after one until the next belongs to that
// line/traverse; and data rows of whitespace-separated tokens matching the header's column count,
// where "*" denotes a no-data value for that field (common before GPS lock at the start of a flight
// line, confirmed in real data — real coordinates DO appear later in the same Line block once the
// instrument locks on). Returns { columns: string[], rows: object[] } where each row has one key per
// column (parsed as a number, or null for "*"/unparseable) plus `_line` (the enclosing Line marker's
// value, or null if a data row appears before any Line marker — real files always have one, but this
// doesn't assume it).
// TASKS.csv #600 (40958Z) — first guesses for the .xyz column picker. Z: an elevation-like channel. Value: a
// corrected / levelled channel first (cormag, tmi, resid…), then any geophysics-looking one (mag, grav, k/th/u,
// ip, res…), skipping a channel that is mostly empty or constant — a GEM walk-mag dump's "cormag" is all zeros
// until the diurnal correction is run, so its raw reading ("rawmag") is the usable one there.
export function guessXyzChannels(columns, rows) {
  const lc = (c) => String(c).toLowerCase();
  const sample = rows.length > 2000 ? rows.filter((_, i) => i % Math.ceil(rows.length / 2000) === 0) : rows;
  const usable = (c) => {
    const v = sample.map((r) => r[c]).filter((x) => Number.isFinite(x));
    return v.length >= sample.length * 0.5 && new Set(v).size > 1;
  };
  const pick = (res, skip = () => false) => { for (const re of res) { const c = columns.find((col) => !skip(col) && re.test(lc(col)) && usable(col)); if (c) return c; } return ""; };
  const z = pick([/^(z|elev|elevation|alt|altitude|height|dem|gps_?elev|elev_?m)$/, /elev|altitude/]);
  // never a coordinate / time / quality channel ("elev" contains "lev", "station-x" contains "x"...)
  // TASKS.csv #1351 — nor the base-station magnetometer: Aeroquest's "basemagf" (before MagN / MagU / MagP / MagS) was taken as the survey
  // TASKS.csv #1351 — nor the reference field: a column that IS the IGRF / DGRF model (or its declination / inclination) sat before TMI in
  // Poplar's channels and was taken as the value ("igrf" stays in the first pattern for a residual like mag_igrf_removed)
  const notValue = (c) => c === z || /^(x|y|z|e|n|east|north|easting|northing|lat|lon|long|latitude|longitude|line|fid|time|date|sat|sq|oper|unit|station.*)$|elev|alt|^base|base_?mag|^bmag|diurnal|^(igrf|dgrf)(_?(f|nt|total|field))?$|^(declin|inclin|declination|inclination)$/.test(lc(c));
  const value = pick([/^cor|_cor|cor_|corr|level|lvl|tmi|resid|igrf|final/, /mag|grav|bouguer|^k$|^th$|^u$|^tc$|cps|ip_|^ip|res|chg|cond|vlf|value/], notValue);
  return { z, value };
}

// TASKS.csv #1326 — "$$DATA$$" tables, the .xyz of 28944Z (Teck, Scott Geophysics, 2006): titles, then the columns' names in 4-character fields, their types, a Fortran
// format saying where each sits in a line, then the rows. Nothing to do with Geosoft's .xyz but the extension.
function parseFortranFields(fmt) {
  const out = [];
  let pos = 0;
  for (const raw of fmt.replace(/^\s*\(|\)\s*$/g, "").split(",")) {
    const t = raw.trim();
    const tab = /^T(\d+)$/i.exec(t);
    if (tab) { pos = Number(tab[1]) - 1; continue; }
    const m = /^(\d*)([AFIE])(\d+)(?:\.\d+)?$/i.exec(t);
    if (!m) return null;
    for (let k = 0; k < Number(m[1] || 1); k++) { out.push({ start: pos, end: pos + Number(m[3]), text: m[2].toUpperCase() === "A" }); pos += Number(m[3]); }
  }
  return out;
}
export function parseDollarData(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const fi = lines.findIndex((l) => /^\s*\(.*[AFIE]\d+.*\)\s*$/i.test(l));
  const nCols = Number(/^\s*\$\$DATA\$\$\s+(\d+)/.exec(lines[0])?.[1]);
  if (fi < 0 || !(nCols > 0)) return null;
  const fields = parseFortranFields(lines[fi].trim());
  if (!fields || fields.length !== nCols) return null;
  let i = fi - 1, types = 0;
  while (i > 0 && types < nCols && /^[\s\d]+$/.test(lines[i])) { types += lines[i].trim().split(/\s+/).length; i--; }
  let nameText = "";
  while (i > 0 && nameText.length < nCols * 4 - 3) { nameText = lines[i].padEnd(lines[i].length) + nameText; i--; }
  const names = Array.from({ length: nCols }, (_, k) => nameText.slice(k * 4, k * 4 + 4).trim() || `C${k + 1}`);
  // the fields are in the format's order and it reads the names in the same order
  const lineCol = names.findIndex((n) => /^line$/i.test(n));
  const rows = [];
  for (const l of lines.slice(fi + 1)) {
    if (!l.trim()) continue;
    const row = { _line: lineCol >= 0 ? l.slice(fields[lineCol].start, fields[lineCol].end).trim() : null };
    fields.forEach((f, k) => {
      const tok = l.slice(f.start, f.end).trim();
      if (f.text) row[names[k]] = tok || null;
      else { const v = tok === "" || tok === "*" ? NaN : Number(tok); row[names[k]] = Number.isFinite(v) ? v : null; }
    });
    rows.push(row);
  }
  return rows.length ? { columns: names, rows } : null;
}

// Scintrex ENVI dumps (.FLD, .BSE): "/!" header lines, one naming the columns "X/Y/TotFld/Noise/Hours/0=Uncor"
function parseScintrex(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const names = lines.map((l) => /^\/!\s*Mag_Data:\s*(\S+)/.exec(l.trim())).find(Boolean)?.[1].split("/");
  if (!names) return null;
  if (!names.some((n) => /^x$/i.test(n))) throw new Error(tr("these are base-station readings: times and field values with no positions, so there is nothing to place on the map."));
  const line = lines.map((l) => /^\/!\s*Line_+:\s*(.+)$/.exec(l.trim())).find(Boolean)?.[1].replace(/\.0+\s*/, "").replace(/\s+/g, "") || null;
  const columns = names.map((n) => (/=/.test(n) ? n.split("=")[1] : n));
  const rows = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith("/") || !/^-?\d/.test(t)) continue;
    const toks = t.split(/\s+/);
    if (toks.length !== columns.length) continue;
    const row = { _line: line };
    columns.forEach((c, k) => { const v = Number(toks[k]); row[c] = Number.isFinite(v) ? v : null; });
    rows.push(row);
  }
  return rows.length ? { columns, rows } : null;
}

// TASKS.csv #1351 — a Geosoft "CSV EXPORT" saved as .XYZ (Poplar, 42711Z): the "/" header, "//" comments, "Line 10" and "*" nulls of an
// XYZ, but every header and data line separated by commas. A line with a comma splits on commas (an empty field is a null); any other
// on white space, as before. Numbers in these files never carry a comma.
export const xyzTokens = (s) => (s.indexOf(",") >= 0 ? s.split(",").map((t) => t.trim()) : s.split(/\s+/));

export function parseXYZ(text) {
  if (/^\s*\$\$DATA\$\$/.test(text)) { const d = parseDollarData(text); if (d) return d; } // #1326
  if (/^\/!\s*Mag_Data:/m.test(text)) { const d = parseScintrex(text); if (d) return d; }
  const lines = text.split(/\r\n|\r|\n/);
  let columns = null;
  let currentLine = null;
  const rows = [];
  // TASKS.csv #600 (40958Z) — the header is not always the FIRST "/" line: a GEM GSM-19 dump opens with a dozen
  // instrument lines ("/Gem Systems GSM-19WV …", "/GPS datum WGS84", …) before "/X Y elev rawmag …", and a
  // Geosoft export can open with "/ XYZ EXPORT …" / "/ DATABASE …". The first one used to be taken, so X / Y
  // landed under "Gem" / "Systems". Every "/" line is a candidate until the first data row; the header is the
  // last candidate with that row's token count (else the last candidate).
  const candidates = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//")) continue; // plain comment (Flight/Date)
    if (trimmed.startsWith("/")) {
      const rest = trimmed.slice(1).trim();
      if (!rest) continue; // lone "/" comment line
      if (/^=+(\s+=+)*$/.test(rest)) continue; // "====...====" underline row
      if (!columns) candidates.push(xyzTokens(rest)); // #1351: commas too
      continue;
    }
    const lineMatch = trimmed.match(/^Line\s+(\S+)/i);
    if (lineMatch) { currentLine = lineMatch[1]; continue; }
    const toks = xyzTokens(trimmed); // #1351
    if (!columns) {
      if (!candidates.length) continue; // a data-shaped row before any header was seen — can't map columns, skip
      columns = [...candidates].reverse().find((c) => c.length === toks.length) || candidates[candidates.length - 1];
    }
    const row = { _line: currentLine };
    for (let i = 0; i < columns.length; i++) {
      const tok = toks[i];
      if (tok === undefined || tok === "*" || tok === "") { row[columns[i]] = null; continue; } // "": an empty comma field (#1351)
      // TASKS.csv #610 — a clock time ("10:46:26.0") is seconds of the day; parseFloat read it as the hour (10)
      const v = tok.includes(":") ? parseClock(tok) : parseFloat(tok);
      row[columns[i]] = Number.isFinite(v) ? v : null;
    }
    rows.push(row);
  }
  if (!columns) throw new Error(tr("No column header line found — expected a \"/\"-prefixed header row (Geosoft .xyz format)."));
  if (!rows.length) throw new Error(tr("No data rows found in this .xyz file."));
  return { columns, rows };
}
