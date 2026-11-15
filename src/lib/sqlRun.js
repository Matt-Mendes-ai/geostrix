// Runs an arbitrary query and returns { columns, rows } (rows as plain arrays, matching columns'
// order) or throws sql.js's own error message directly — a SQL syntax/reference error is exactly the
// kind of thing that should surface verbatim to a user who just typed the query themselves, not get
// wrapped/genericized.
// TASKS.csv #3579 (Fireweed / Macpass rehearsal) — 'SELECT * FROM assays' listed PbO and ZnO, the oxide names that exist so a query can say them (#2914): computed, never imported.
// A star select leaves out the computed columns unless the query names them, and says which it left out (result.omitted).
const STAR_SELECT = /^\s*select\s+(distinct\s+)?([\w"]+\.)?\*\s+from\b/i;
function computedColumns(db) {
  const out = new Set();
  const names = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  for (const [name] of names[0]?.values || []) for (const r of db.exec(`PRAGMA table_xinfo("${String(name).replace(/"/g, '""')}");`)[0]?.values || []) if (r[6] === 2 || r[6] === 3) out.add(r[1]);
  return out;
}
// whether the text names the column as a word (any case, quoted or not)
const namesColumn = (text, col) => text.toLowerCase().split(/[^\w]+/).includes(String(col).toLowerCase());
export function runQuery(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return { columns: [], rows: [] };
  const { columns, values } = res[0];
  if (!STAR_SELECT.test(sql)) return { columns, rows: values };
  const computed = computedColumns(db), rest = sql.replace(STAR_SELECT, "");
  const drop = columns.map((c) => computed.has(c) && !namesColumn(rest, c));
  if (!drop.some(Boolean)) return { columns, rows: values };
  return { columns: columns.filter((_, i) => !drop[i]), rows: values.map((row) => row.filter((_, i) => !drop[i])), omitted: columns.filter((_, i) => drop[i]) };
}
