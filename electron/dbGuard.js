// TASKS.csv #590 — the read-only session (#348) was a guard a user could switch off from the SQL box: the
// connection persists between runs (#206), so running `SET default_transaction_read_only = off` (PostgreSQL) or
// `SET SESSION TRANSACTION READ WRITE` (MySQL) — one statement, so #477 let it through — made the NEXT run's
// DELETE succeed. Reproduced on PostgreSQL 18 with GeoStrix's own pgConfig: refused, SET ok, DELETE 1.
//
// Now every statement runs inside its own read-only transaction that is always rolled back, so nothing a
// statement changes about the session outlives it (a PostgreSQL SET is undone by the ROLLBACK; for MySQL, whose
// SET SESSION survives a rollback, read-only is re-asserted before every statement). The one exception is the
// Browser panel's chunked table import (src/lib/dbSql.js chunkedReadPlan), which needs ONE transaction across
// its DECLARE / FETCH / CLOSE calls: its exact BEGIN opens it, and while it is open nothing that ends a
// transaction or changes session settings is accepted until the import's own ROLLBACK closes it.

// the import's opening statements, exactly as chunkedReadPlan writes them
const IMPORT_BEGIN = new Set(["BEGIN READ ONLY;", "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;"]);
const SESSION_CONTROL = /^\s*(begin|start|commit|end|rollback|abort|savepoint|release|set|reset|discard)\b/i;

// entry: { client: { query(sql) }, safeConfig: { engine }, importTxn? } — the live connection record (main.js)
async function guardedQuery(entry, sql) {
  const s = String(sql ?? "").trim();
  const mysql = entry.safeConfig?.engine === "mysql";
  const q = (text) => entry.client.query(text);
  if (entry.importTxn) {
    if (/^rollback;?$/i.test(s)) { entry.importTxn = false; return q(s); }
    if (SESSION_CONTROL.test(s)) throw new Error("A table import is running on this connection — wait for it to finish, then run this again.");
    return q(s);
  }
  if (IMPORT_BEGIN.has(s)) {
    if (mysql) await q("SET SESSION TRANSACTION READ ONLY");
    const r = await q(s);
    entry.importTxn = true;
    return r;
  }
  if (mysql) await q("SET SESSION TRANSACTION READ ONLY");
  await q(mysql ? "START TRANSACTION READ ONLY" : "BEGIN TRANSACTION READ ONLY");
  try {
    return await q(s);
  } finally {
    await q("ROLLBACK").catch(() => {});
  }
}

module.exports = { guardedQuery, IMPORT_BEGIN };
