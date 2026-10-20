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

test("the chunked import (importStep) keeps one transaction; the SQL box is refused until its ROLLBACK", async () => {
  const f = fake("postgres");
  const step = { importStep: true };
  await guardedQuery(f.entry, "BEGIN READ ONLY;", step);
  await guardedQuery(f.entry, "FETCH FORWARD 10 FROM geostrix_import_cursor;", step);
  await assert.rejects(guardedQuery(f.entry, "SELECT 1"), /import is running/); // the SQL box while the import is open
  await assert.rejects(guardedQuery(f.entry, "/**/COMMIT", step), /may not change the transaction/);
  await guardedQuery(f.entry, "ROLLBACK;", step);
  assert.deepEqual(f.sent, ["BEGIN READ ONLY;", "FETCH FORWARD 10 FROM geostrix_import_cursor;", "ROLLBACK;"]);
  assert.equal(f.entry.importTxn, false);
  await guardedQuery(f.entry, "SELECT 1");
  assert.deepEqual(f.sent.slice(3), ["BEGIN TRANSACTION READ ONLY", "SELECT 1", "ROLLBACK"]);
});

// TASKS.csv #665 — the review's bypass: typed BEGIN READ ONLY; then comment-prefixed COMMIT / SET, then a DELETE
test("#665 typed import-like SQL never opens import mode; comment-prefixed session control is still wrapped", async () => {
  for (const engine of ["postgres", "mysql"]) {
    const f = fake(engine);
    for (const sql of ["BEGIN READ ONLY;", "/**/COMMIT", "/**/SET default_transaction_read_only = off", "-- note\nCOMMIT", "DELETE FROM assays"]) await guardedQuery(f.entry, sql);
    assert.ok(!f.entry.importTxn, `${engine}: import mode was entered`);
    const del = f.sent.indexOf("DELETE FROM assays");
    const begin = engine === "mysql" ? "START TRANSACTION READ ONLY" : "BEGIN TRANSACTION READ ONLY";
    assert.equal(f.sent[del - 1], begin, `${engine}: the DELETE runs inside a read-only transaction`);
    assert.equal(f.sent[del + 1], "ROLLBACK");
  }
  // an import step that is not the opening statement is refused while no import is open
  const g = fake("postgres");
  await assert.rejects(guardedQuery(g.entry, "FETCH FORWARD 10 FROM c;", { importStep: true }), /not open/);
});

test("#665 calls on one connection run one at a time (no interleaving at the guard's awaits)", async () => {
  const sent = [];
  let inFlight = 0, overlap = false;
  const entry = { safeConfig: { engine: "postgres" }, client: { query: async (s) => { inFlight++; if (inFlight > 1) overlap = true; sent.push(s); await new Promise((r) => setTimeout(r, 2)); inFlight--; return { rows: [] }; } } };
  await Promise.all([guardedQuery(entry, "SELECT 1"), guardedQuery(entry, "SELECT 2"), guardedQuery(entry, "SELECT 3")]);
  assert.equal(overlap, false);
  assert.deepEqual(sent, ["BEGIN TRANSACTION READ ONLY", "SELECT 1", "ROLLBACK", "BEGIN TRANSACTION READ ONLY", "SELECT 2", "ROLLBACK", "BEGIN TRANSACTION READ ONLY", "SELECT 3", "ROLLBACK"]);
});
