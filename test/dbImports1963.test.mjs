// TASKS.csv #1963 — the record a database import leaves in the project, so "Reload from database" can re-pull the table
// and commit it through the same choices without finding the schema and table again
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dbImportRecord, upsertDbImport, removeDbImport, dbImportKey, describeDbImport } from "../src/lib/dbImports.js";
import { FIELDS, PROJECT_VERSION } from "../src/lib/projectFields.js";

const modal = { target: "collars", mapping: { hole_id: "HOLEID", x: "EAST", y: "NORTH", z: "RL" }, allRows: [{ HOLEID: "H1" }], sampleRows: [{}], rowCount: 1, headers: ["HOLEID", "EAST", "NORTH", "RL"], fileName: "db:geo.collars", dipConvention: "neg_down", azimuthRef: "grid", units: "ft", busy: false, file: { name: "x" } };
const src = { profile: "Site DB", schema: "drilling", table: "collars", limit: null };

test("#1963 the record keeps the dialog's choices without the rows, and names the profile, schema and table", () => {
  const r = dbImportRecord(modal, src);
  assert.equal(r.target, "collars"); assert.deepEqual(r.dbSource, { profile: "Site DB", schema: "drilling", table: "collars", limit: null });
  assert.equal(r.fileName, "db:geo.collars");
  assert.deepEqual(Object.keys(r.choices).sort(), ["azimuthRef", "dipConvention", "fileName", "headers", "mapping", "target", "units"]);
  assert.ok(!("allRows" in r.choices) && !("sampleRows" in r.choices) && !("file" in r.choices));
  assert.equal(dbImportRecord(modal, { schema: "s", table: "t" }), null, "no profile: nothing to reconnect to");
  assert.equal(describeDbImport(r), "drilling.collars → collars");
  assert.equal(describeDbImport({ ...r, dbSource: { ...r.dbSource, schema: null, limit: 500 } }), "collars → collars (first 500)");
});

test("#1963 one record per target per table: a second import of the same table replaces the first; removal by id", () => {
  const a = dbImportRecord(modal, src), b = dbImportRecord({ ...modal, mapping: { ...modal.mapping, z: "ELEV" } }, src);
  const c = dbImportRecord({ ...modal, target: "survey" }, { ...src, table: "survey" });
  let list = upsertDbImport([], a); list = upsertDbImport(list, c); list = upsertDbImport(list, b);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((r) => r.dbSource.table), ["survey", "collars"]);
  assert.equal(list[1].choices.mapping.z, "ELEV");
  assert.equal(dbImportKey(a), dbImportKey(b));
  assert.equal(removeDbImport(list, c.id).length, 1);
  assert.deepEqual(upsertDbImport(undefined, null), []);
});

test("#1963 dbImports is a project field (saved with the project, not undoable, never in the view bundle)", () => {
  const f = FIELDS.find((x) => x.key === "dbImports");
  assert.ok(f && f.track === "dirty"); assert.deepEqual(f.empty(), []);
  assert.ok(PROJECT_VERSION >= 24);
  const sl = readFileSync(new URL("../src/lib/useTablePull.js", import.meta.url), "utf8");
  assert.match(sl, /dbSource: \{ profile: profile\?\.name/);
  assert.match(sl, /export async function pullAllRows/);
});
