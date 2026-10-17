// TASKS.csv #590 — every SQL-box statement in its own read-only transaction; the chunked import's own transaction
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { guardedQuery } = createRequire(import.meta.url)("../electron/dbGuard.js");

const fake = (engine) => { const sent = []; return { sent, entry: { safeConfig: { engine }, client: { query: async (s) => { sent.push(s); if (/boom/.test(s)) throw new Error("boom"); return { rows: [] }; } } } }; };

test("postgres: wrapped in BEGIN READ ONLY ... ROLLBACK, also when the statement fails", async () => {
  const f = fake("postgres");
  await guardedQuery(f.entry, "SET default_transaction_read_only = off");
  await assert.rejects(guardedQuery(f.entry, "SELECT boom"));
  assert.deepEqual(f.sent, ["BEGIN TRANSACTION READ ONLY", "SET default_transaction_read_only = off", "ROLLBACK", "BEGIN TRANSACTION READ ONLY", "SELECT boom", "ROLLBACK"]);
});

test("mysql: read-only re-asserted before every statement (SET SESSION survives a rollback)", async () => {
  const f = fake("mysql");
  await guardedQuery(f.entry, "SET SESSION TRANSACTION READ WRITE");
  await guardedQuery(f.entry, "DELETE FROM t");
  assert.deepEqual(f.sent.filter((s) => s === "SET SESSION TRANSACTION READ ONLY").length, 2);
  assert.ok(f.sent.indexOf("DELETE FROM t") > f.sent.lastIndexOf("SET SESSION TRANSACTION READ ONLY"));
});

test("the chunked import keeps one transaction; session control is refused until its ROLLBACK", async () => {
  const f = fake("postgres");
  await guardedQuery(f.entry, "BEGIN READ ONLY;");
  await guardedQuery(f.entry, "FETCH FORWARD 10 FROM geostrix_import_cursor;");
  await assert.rejects(guardedQuery(f.entry, "SET default_transaction_read_only = off"), /import is running/);
  await assert.rejects(guardedQuery(f.entry, "commit"), /import is running/);
  await guardedQuery(f.entry, "ROLLBACK;");
  assert.deepEqual(f.sent, ["BEGIN READ ONLY;", "FETCH FORWARD 10 FROM geostrix_import_cursor;", "ROLLBACK;"]);
  assert.equal(f.entry.importTxn, false);
  await guardedQuery(f.entry, "SELECT 1");
  assert.deepEqual(f.sent.slice(3), ["BEGIN TRANSACTION READ ONLY", "SELECT 1", "ROLLBACK"]);
});
