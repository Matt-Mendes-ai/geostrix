// TASKS.csv #349 — the DB Browser's SQL, per engine. It was Postgres-only: identifiers in double quotes
// (MySQL reads "x" as a STRING, so `SELECT COUNT(*) FROM "db"."tbl"` fails), and big tables were read with
// DECLARE ... CURSOR / FETCH / BEGIN READ ONLY, none of which exist in MySQL. Pure: unit-tested.
//
// Chunked reads:
//   postgres — a NO SCROLL cursor inside BEGIN READ ONLY (as before, #282/#348): one scan, no duplicates.
//   mysql    — START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY, then LIMIT/OFFSET pages. The snapshot
//              means every page reads the same version of the table, so rows added or removed by someone
//              else meanwhile cannot duplicate or skip rows. Without an ORDER BY, SQL does not promise a
//              stable row order between pages; InnoDB reads in primary-key order within one snapshot, which
//              is what makes this safe in practice there (MyISAM tables have no snapshot at all).

export const isMysql = (engine) => engine === "mysql";

export function quoteIdent(engine, s) {
  const str = String(s);
  return isMysql(engine) ? `\`${str.replace(/`/g, "``")}\`` : `"${str.replace(/"/g, '""')}"`;
}

export const qualifiedName = (engine, schema, table) => `${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;

export const countSql = (engine, schema, table) => `SELECT COUNT(*) AS n FROM ${qualifiedName(engine, schema, table)};`;

export const selectSql = (engine, schema, table, limit = null) =>
  `SELECT * FROM ${qualifiedName(engine, schema, table)}${limit == null ? "" : ` LIMIT ${Math.max(0, Math.floor(limit))}`};`;

const CURSOR = "geostrix_import_cursor";
// The statements for a chunked, read-only pull. `page(want, offset)` gives the SQL for the next chunk.
export function chunkedReadPlan(engine, schema, table) {
  const q = qualifiedName(engine, schema, table);
  if (isMysql(engine)) {
    return {
      begin: "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;",
      open: null,
      page: (want, offset) => `SELECT * FROM ${q} LIMIT ${Math.floor(want)} OFFSET ${Math.floor(offset)};`,
      close: null,
      end: "ROLLBACK;",
    };
  }
  return {
    begin: "BEGIN READ ONLY;",
    open: `DECLARE ${CURSOR} NO SCROLL CURSOR FOR SELECT * FROM ${q};`,
    page: (want) => `FETCH FORWARD ${Math.floor(want)} FROM ${CURSOR};`,
    close: `CLOSE ${CURSOR};`,
    end: "ROLLBACK;",
  };
}
