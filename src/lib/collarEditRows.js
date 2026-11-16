// TASKS.csv #3711 (Fireweed rehearsal round 3) — 'Inspect / edit table' on the collars showed one column 'attrs' with '[object Object]' on every row: the collar's own fields
// (hole type, year, property, prospect, news release: collar.attrs) were an object in one cell. The table now has one column per field, as the exported collars.csv has
// (#3613), and a save puts the columns back into attrs. A field named like one of the collar's own columns shows as '<name> (field)'.
const OWN = ["hole_id", "x", "y", "z", "azimuth", "dip", "length"];
const FIELD_SUFFIX = " (field)";

// the columns the collars' attrs add, in first-seen order, each with the name it is shown under: [{ key, column }]
export function collarFieldColumns(collars) {
  const seen = new Map();
  for (const c of collars || []) for (const k of Object.keys(c?.attrs || {})) if (!seen.has(k)) seen.set(k, OWN.includes(k) || k.startsWith("_") ? `${k}${FIELD_SUFFIX}` : k);
  const out = [], used = new Set(OWN);
  for (const [key, column] of seen) { let col = column; while (used.has(col)) col += FIELD_SUFFIX; used.add(col); out.push({ key, column: col }); }
  return out;
}

// the collars as the table's rows: the collar's own columns, then one per field (the same columns on every row, blank where a hole has none); no attrs object
export function collarsToEditRows(collars) {
  const cols = collarFieldColumns(collars);
  return (collars || []).map((c) => {
    const { attrs, ...rest } = c || {};
    const row = { ...rest };
    for (const { key, column } of cols) row[column] = attrs && Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : "";
    return row;
  });
}

// the table's edited rows back to collars: the field columns gathered into attrs (a blank cell is no field; a number stays a number)
export function editRowsToCollars(rows, original) {
  const cols = collarFieldColumns(original), colNames = new Set(cols.map((c) => c.column));
  return (rows || []).map((r) => {
    const out = {}, attrs = {};
    for (const [k, v] of Object.entries(r)) if (!colNames.has(k)) out[k] = v;
    for (const { key, column } of cols) { const v = r[column]; if (v !== undefined && v !== null && v !== "") attrs[key] = v; }
    if (Object.keys(attrs).length) out.attrs = attrs;
    return out;
  });
}
