// TASKS.csv #3755 (follow-up of #3728) — the sample fields the assay import keeps (row.attrs: Zone, Target ...) as columns of the assay Data table, the SQL assays table, the Data table's
// CSV and Identify's card. Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { assayAttrNames, assayAttrValue, MAX_ATTR_COLUMNS } from "../src/lib/assayExtraFields.js";
import { buildTable, applyTable } from "../src/lib/dataTable.js";
import { buildTables } from "../src/lib/sqlTables.js";
import { attributeFields } from "../src/lib/viewer/identify.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const assays = [
  { hole_id: "A", from: 0, to: 1, values: { Au: 1.5 }, attrs: { Zone: "West", Target: "T1" } },
  { hole_id: "A", from: 1, to: 2, values: { Au: 0.2 }, attrs: { zone: "East" } }, // the same field, another case
  { hole_id: "B", from: 0, to: 1, values: { Au: 9 } }, // no attrs
  { hole_id: "B", from: 1, to: 2, values: { Au: 3 }, attrs: { Zone: "", Note: { nested: 1 } } }, // blank and object values are not fields
];

test("#3755 assayAttrNames: first-seen order, one name per field whatever its case, no blank or object values, capped", () => {
  assert.deepEqual(assayAttrNames(assays), ["Zone", "Target"]);
  assert.equal(assayAttrValue(assays[1], "Zone"), "East"); assert.equal(assayAttrValue(assays[0], "target"), "T1");
  assert.equal(assayAttrValue(assays[2], "Zone"), null); assert.equal(assayAttrValue(assays[3], "Zone"), null);
  assert.deepEqual(assayAttrNames([]), []); assert.deepEqual(assayAttrNames(null), []);
  const wide = [{ attrs: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ["F" + i, "v"])) }];
  assert.equal(assayAttrNames(wide).length, MAX_ATTR_COLUMNS);
});

test("#3755 the assay Data table has a column per kept field; filters, sort and the CSV rows carry them", () => {
  const t = buildTable("assays", { assays, assayElements: [{ symbol: "Au", unit: "ppm" }] });
  assert.deepEqual(t.columns.map((c) => c.key), ["hole_id", "from", "to", "attr:Zone", "attr:Target", "el:Au"]);
  assert.deepEqual(t.rows[0], ["A", 0, 1, "West", "T1", 1.5]); assert.deepEqual(t.rows[1], ["A", 1, 2, "East", null, 0.2]); assert.deepEqual(t.rows[2], ["B", 0, 1, null, null, 9]);
  const keep = applyTable(t, { filters: { 3: "west" } }); // column 3 is Zone: a filter by index, as the modal does
  assert.equal(keep.length, 1);
  assert.equal(buildTable("assays", { assays: [{ hole_id: "A", from: 0, to: 1, values: { Au: 1 } }], assayElements: [{ symbol: "Au", unit: "ppm" }] }).columns.length, 4); // no attrs: no extra column
});

test("#3755 the SQL assays table has the kept fields as TEXT columns; a name an element has is skipped", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  await buildTables(db, { assays, assayElements: [{ symbol: "Au", unit: "ppm" }] });
  const r = db.exec(`SELECT hole_id, Zone, Target, Au FROM assays WHERE Zone = 'West'`);
  assert.deepEqual(r[0].values, [["A", "West", "T1", 1.5]]);
  assert.equal(db.exec(`SELECT count(*) FROM assays WHERE Zone IS NULL`)[0].values[0][0], 2);
  const db2 = new SQL.Database();
  await buildTables(db2, { assays: [{ hole_id: "A", from: 0, to: 1, values: { Au: 1 }, attrs: { Au: "text", Zone: "z" } }], assayElements: [{ symbol: "Au", unit: "ppm" }] });
  assert.equal(db2.exec(`SELECT Au FROM assays`)[0].values[0][0], 1); // the element wins
  assert.equal(db2.exec(`SELECT Zone FROM assays`)[0].values[0][0], "z");
});

test("#3755 Identify's card lists the kept fields of an assay interval (attributeFields reads the attrs object)", () => {
  assert.deepEqual(attributeFields({ Zone: "West", Target: "T1" }, new Set()), [["Zone", "West"], ["Target", "T1"]]);
  const src = read("../src/lib/viewer/identify.js");
  assert.match(src, /if \(row\.values && row\.attrs && typeof row\.attrs === "object"\) fields\.push\(\.\.\.attributeFields\(row\.attrs, new Set\(\)\)\);/);
});
