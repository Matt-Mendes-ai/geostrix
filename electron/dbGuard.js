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

// TASKS.csv #665 — the import mode used to be ENTERED by matching typed SQL: typing the import's exact
// "BEGIN READ ONLY;" in the SQL box opened it, and then a comment-prefixed "/**/COMMIT" and "/**/SET
// default_transaction_read_only = off" slipped past SESSION_CONTROL (a regex anchored at the first word), so a DELETE
// reached the server outside any read-only transaction. Now:
//  * only a call made WITH { importStep: true } (DbBrowserPanel's chunked import, never the SQL box) can open, use or
//    close the import transaction; the SQL box's statements are always wrapped, whatever they say;
//  * leading comments are stripped before the session-control check;
//  * calls on one connection run one at a time (an SQL-box statement could interleave with the import's awaits), and
//    while an import is open an SQL-box statement is refused with a message naming it.
const IMPORT_BEGIN = new Set(["BEGIN READ ONLY;", "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;"]);
const SESSION_CONTROL = /^\s*(begin|start|commit|end|rollback|abort|savepoint|release|set|reset|discard)\b/i;
const LEADING_COMMENTS = /^(\s*(--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/))*\s*/;
const firstWords = (s) => s.replace(LEADING_COMMENTS, "");

// entry: { client: { query(sql) }, safeConfig: { engine }, importTxn?, queue? } — the live connection record (main.js)
function guardedQuery(entry, sql, opts = {}) {
  const run = () => guardedQueryNow(entry, sql, opts);
  const p = (entry.queue || Promise.resolve()).then(run, run);
  entry.queue = p.catch(() => {});
  return p;
}

async function guardedQueryNow(entry, sql, { importStep = false } = {}) {
  const s = String(sql ?? "").trim();
  const mysql = entry.safeConfig?.engine === "mysql";
  const q = (text) => entry.client.query(text);
  if (importStep) {
    if (!entry.importTxn) {
      if (!IMPORT_BEGIN.has(s)) throw new Error("The table import's transaction is not open.");
      if (mysql) await q("SET SESSION TRANSACTION READ ONLY");
      const r = await q(s);
      entry.importTxn = true;
      return r;
    }
    if (/^rollback;?$/i.test(s)) { entry.importTxn = false; return q(s); }
    if (SESSION_CONTROL.test(firstWords(s))) throw new Error("The table import may not change the transaction or session.");
    return q(s);
  }
  if (entry.importTxn) throw new Error("A table import is running on this connection (Browser panel) — wait for it to finish or cancel it there, then run this again.");
  if (mysql) await q("SET SESSION TRANSACTION READ ONLY");
  await q(mysql ? "START TRANSACTION READ ONLY" : "BEGIN TRANSACTION READ ONLY");
  try {
    return await q(s);
  } finally {
    await q("ROLLBACK").catch(() => {});
  }
}

module.exports = { guardedQuery, IMPORT_BEGIN };
