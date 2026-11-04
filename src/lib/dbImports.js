// TASKS.csv #1963 — Matt: "I wanna have the option on the 3d view to reload the imported layers from the database ... a reload
// data button. That way I don't have to search for the schema in the database and load it again." Every table pulled from a
// database and committed through the mapping dialog (collars, survey, a log / point layer, structures, a custom layer) or
// Geochem's assay dialog leaves a record in the project: which connection PROFILE (by name: the host, login and database
// stay on this computer, #1081), schema and table, and every choice the dialog made (the column mapping, units, azimuth
// reference, element list...). "Reload from database" re-pulls each table and commits it through the same choices.
// Pure: no React.

const SKIP = new Set(["allRows", "sampleRows", "rowCount", "busy", "file", "guessNote", "replaceInfo"]);

// the identity of a record: one per target per table (a table imported twice into the same target keeps the last choices)
export const dbImportKey = (rec) => `${rec.target}|${rec.dbSource?.profile ?? ""}|${rec.dbSource?.schema ?? ""}|${rec.dbSource?.table ?? ""}`;

// modalData: the mapping dialog's (or the assay dialog's) resolved state; dbSource: { profile, schema, table, limit }
// -> the record kept in the project: the dialog's choices without the rows
export function dbImportRecord(modalData, dbSource, target = modalData?.target) {
  if (!dbSource?.profile || !dbSource?.table) return null;
  const choices = {};
  for (const [k, v] of Object.entries(modalData || {})) { if (SKIP.has(k) || typeof v === "function") continue; choices[k] = v; }
  return { id: `dbi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, target, dbSource: { profile: dbSource.profile, schema: dbSource.schema || null, table: dbSource.table, limit: dbSource.limit ?? null }, fileName: modalData?.fileName || `db:${dbSource.table}`, choices, when: new Date().toISOString() };
}

export function upsertDbImport(list, rec) {
  if (!rec) return list || [];
  const key = dbImportKey(rec);
  return [...(list || []).filter((r) => dbImportKey(r) !== key), rec];
}

export const removeDbImport = (list, id) => (list || []).filter((r) => r.id !== id);

// one line per record, for the button's tooltip and the summary
export function describeDbImport(rec) {
  const t = `${rec.dbSource?.schema ? `${rec.dbSource.schema}.` : ""}${rec.dbSource?.table ?? "?"}`;
  return `${t} → ${rec.target}${rec.dbSource?.limit ? ` (first ${rec.dbSource.limit})` : ""}`;
}
