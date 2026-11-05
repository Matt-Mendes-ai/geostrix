// TASKS.csv #1799 — soil data in SQL (a surface_samples table), Calc. element and Correlation
import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { createSurfaceSamplesTable, surfaceSampleColumns } from "../src/lib/sqlSurfaceTable.js";
import { addCalculatedElement } from "../src/lib/calcElement.js";
import { correlationMatrix } from "../src/lib/correlation.js";
import { valueIn } from "../src/lib/geochem.js";

const samples = [
  { sample_id: "S1", x: 1, y: 2, medium: "soil", values: { Cu: 200, Au: 0.012, Mo: 5 }, attrs: { Horizon: "B" } },
  { sample_id: "S2", x: 3, y: 4, medium: "soil", values: { Cu: 90, Au: 0.02 } },
  { sample_id: "S3", x: 5, y: 6, medium: "rock", values: { Cu: 1600, Au: 0.4, Mo: 30 }, attrs: { Horizon: "C" } },
];
const elements = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "ppm" }, { symbol: "Mo", unit: "ppm" }];

test("surface_samples: one row per sample, one column per element, attrs as JSON", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  createSurfaceSamplesTable(db, samples, elements);
  const q = (sql) => db.exec(sql)[0]?.values || [];
  assert.deepEqual(q("SELECT sample_id FROM surface_samples WHERE medium = 'soil' AND Cu > 160 AND Au > 0.0096"), [["S1"]]);
  assert.deepEqual(q("SELECT sample_id, Mo FROM surface_samples WHERE Mo IS NULL"), [["S2", null]]);
  assert.deepEqual(q("SELECT json_extract(attrs, '$.Horizon') FROM surface_samples WHERE sample_id = 'S3'"), [["C"]]);
  assert.deepEqual(q("SELECT x, y FROM surface_samples WHERE sample_id = 'S2'"), [[3, 4]]);
  db.close();
});

test("an element named like a fixed column does not shadow it", () => {
  assert.deepEqual(surfaceSampleColumns([{ symbol: "Cu" }, { symbol: "X" }, { symbol: "medium" }, { symbol: "cu" }]), ["Cu"]);
});

test("no surface samples, no table", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  createSurfaceSamplesTable(db, [], elements);
  assert.equal(db.exec("SELECT name FROM sqlite_master WHERE name = 'surface_samples'").length, 0);
  db.close();
});

test("a calculated element on the surface samples (a Cu + Au index)", () => {
  const r = addCalculatedElement(samples, elements, "CuAu", "Cu/10000 + 0.6*Au", "index");
  assert.equal(r.computed, 3);
  assert.equal(r.assays[0].values.CuAu, 200 / 10000 + 0.6 * 0.012);
  assert.equal(r.assays[0].sample_id, "S1");
  assert.equal(r.assays[0].medium, "soil", "the sample keeps its fields");
  const m = addCalculatedElement(samples, elements, "MoCu", "Mo/Cu");
  assert.equal(m.skipped, 1, "S2 has no Mo");
});

test("correlation runs on surface rows (their values, one per sample)", () => {
  const units = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  const cols = Object.fromEntries(["Cu", "Au"].map((s) => [s, samples.map((a) => valueIn(a, s, "ppm", units))]));
  const m = correlationMatrix(cols, ["Cu", "Au"], "spearman", new Map());
  assert.ok(m);
});
