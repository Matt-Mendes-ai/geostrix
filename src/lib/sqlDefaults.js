// TASKS.csv #2034 / #2360 / #2204 — the SQL workspace's opening query and its column list. The opening query compared the text sample id
// with 1 and listed the samples with no result first (#2034, #2360), and from / to are SQL words that fail unquoted (#2204).

const NOT_ELEMENTS = new Set(["hole_id", "from", "to", "source", "sample_id", "sample_type", "parent_id", "qc_code"]);
// SQLite keywords a column here is likely to be named; quoted in the list so a query can be written from it as it reads
const SQL_WORDS = new Set(["from", "to", "order", "group", "where", "select", "table", "index", "values", "set", "by", "as", "on", "in", "is", "not", "and", "or", "limit", "case", "check", "default", "key", "primary", "references", "transaction", "end", "desc", "asc"]);

export const quoteIdent = (c) => `"${String(c).replace(/"/g, '""')}"`;
// a column as it must be written in a query: plain when it can be, "quoted" for an SQL word or anything not a plain identifier
export const sqlColumnLabel = (c) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(c)) && !SQL_WORDS.has(String(c).toLowerCase()) ? String(c) : quoteIdent(c));

// tables: [{ name, columns }] from buildTables. lead: the project's lead commodity (useLeadCommodity), or null.
// The assays' lead element (else the first element column), highest first, measured results only: no cut-off is assumed.
export function defaultQueryFor(tables, lead = null) {
  const assaysTable = (tables || []).find((t) => t.name === "assays");
  if (assaysTable) {
    const cols = assaysTable.columns || [];
    const elements = cols.filter((c) => !NOT_ELEMENTS.has(c) && !/_q$/.test(c));
    const el = lead && elements.includes(lead) ? lead : elements[0];
    if (el) {
      const q = quoteIdent(el), keep = ["hole_id", '"from"', '"to"', ...(cols.includes("sample_id") ? ["sample_id"] : []), q].join(", ");
      const measured = cols.includes(`${el}_q`) ? ` AND ${quoteIdent(`${el}_q`)} IS NULL` : ""; // #2521 — '<' / '>' results are limits
      return `SELECT ${keep} FROM assays WHERE ${q} IS NOT NULL${measured} ORDER BY ${q} DESC LIMIT 100;`;
    }
  }
  if ((tables || []).some((t) => t.name === "surface_samples")) return "SELECT * FROM surface_samples LIMIT 100;"; // #1799
  if ((tables || []).some((t) => t.name === "collars")) return "SELECT * FROM collars LIMIT 100;";
  return tables?.length ? `SELECT * FROM ${quoteIdent(tables[0].name)} LIMIT 100;` : "";
}
