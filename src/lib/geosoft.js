// TASKS.csv — Geosoft (Oasis montaj) file format import, added after a survey of a real 787-file
// Oasis montaj sample dataset (see TASKS.csv note for the full list of what was/wasn't tractable).
// Both formats here were reverse-engineered directly from real sample files, not guessed from
// extension or vendor docs — .ply is Geosoft's own boundary/polygon format (NOT Stanford's unrelated
// mesh format that shares the extension by coincidence), .xyz is Geosoft's ASCII line/profile data
// export (airborne geophysics, ground surveys, etc.), both plain text with no public spec beyond
// "what real exported files actually look like".

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
    throw new Error("No usable boundary vertices found — expected whitespace-separated \"X Y\" lines (Geosoft .ply format).");
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
export function parseXYZ(text) {
  const lines = text.split(/\r\n|\r|\n/);
  let columns = null;
  let currentLine = null;
  const rows = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//")) continue; // plain comment (Flight/Date)
    if (trimmed.startsWith("/")) {
      const rest = trimmed.slice(1).trim();
      if (!rest) continue; // lone "/" comment line
      if (/^=+(\s+=+)*$/.test(rest)) continue; // "====...====" underline row
      if (!columns) columns = rest.split(/\s+/); // first "/"-prefixed content line is the header
      continue;
    }
    const lineMatch = trimmed.match(/^Line\s+(\S+)/i);
    if (lineMatch) { currentLine = lineMatch[1]; continue; }
    if (!columns) continue; // a data-shaped row before any header was seen — can't map columns, skip
    const toks = trimmed.split(/\s+/);
    const row = { _line: currentLine };
    for (let i = 0; i < columns.length; i++) {
      const tok = toks[i];
      if (tok === undefined || tok === "*") { row[columns[i]] = null; continue; }
      const v = parseFloat(tok);
      row[columns[i]] = Number.isFinite(v) ? v : null;
    }
    rows.push(row);
  }
  if (!columns) throw new Error("No column header line found — expected a \"/\"-prefixed header row (Geosoft .xyz format).");
  if (!rows.length) throw new Error("No data rows found in this .xyz file.");
  return { columns, rows };
}
