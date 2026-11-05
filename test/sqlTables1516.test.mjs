// TASKS.csv #1516 (review #1497, Lawyers) — the SQL workspace's tables are filled in transactions and chunks with progress,
// hold the custom layers, and carry the sample id / type columns of the assays
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { buildTables, customLayerTables, assaySampleColumns, CHUNK_ROWS } from "../src/lib/sqlTables.js";

const SQL = await initSqlJs();
const q = (db, sql) => db.exec(sql)[0]?.values ?? [];

test("assays carry sample_id / sample_type / parent_id / qc_code columns when the rows have them, before the elements", async () => {
  const db = new SQL.Database();
  const assays = [
    { hole_id: "H1", from: 0, to: 1, values: { Au: 1.5, Cu: 100 }, sample_id: "S1", sample_type: "standard", qc_code: "OREAS-60" },
    { hole_id: "H1", from: 1, to: 2, values: { Au: 0.2, Cu: null }, sample_id: "S2" },
  ];
  assert.deepEqual(assaySampleColumns(assays), ["sample_id", "sample_type", "qc_code"]);
  const tables = await buildTables(db, { assays, assayElements: [{ symbol: "Au" }, { symbol: "Cu" }] });
  assert.deepEqual(tables.find((t) => t.name === "assays").columns, ["hole_id", "from", "to", "source", "sample_id", "sample_type", "qc_code", "Au", "Cu"]);
  assert.deepEqual(q(db, "SELECT sample_id, sample_type, qc_code, Au FROM assays ORDER BY \"from\""), [["S1", "standard", "OREAS-60", 1.5], ["S2", null, null, 0.2]]);
  assert.deepEqual(q(db, "SELECT COUNT(*) FROM assays WHERE sample_type = 'standard'"), [[1]]);
  db.close();
});

test("assays without sample columns keep the old shape", async () => {
  const db = new SQL.Database();
  const tables = await buildTables(db, { assays: [{ hole_id: "H1", from: 0, to: 1, values: { Au: 1 } }], assayElements: [{ symbol: "Au" }] });
  assert.deepEqual(tables.find((t) => t.name === "assays").columns, ["hole_id", "from", "to", "source", "Au"]);
  db.close();
});

test("custom layers become custom_<name> tables, colours left out, duplicate names numbered", async () => {
  const rows = [{ hole_id: "H1", from: 0, to: 5, value: "Min Domain A", modelColor: "#fff", modelled: true }];
  const t = customLayerTables([{ id: 1, name: "Min Domain", rows }, { id: 2, name: "Min Domain", rows }, { id: 3, name: "Empty", rows: [] }, { id: 4, name: "Vein Interval (1)", rows }, { id: 5, name: "2021 & 2022 DDH Silicification.csv (6 more queued)", rows }, { id: 6, name: "Voids.CSV", rows }]);
  assert.deepEqual(Object.keys(t), ["custom_min_domain", "custom_min_domain_2", "custom_vein_interval_1", "custom_2021_2022_ddh_silicification", "custom_voids"]);
  const db = new SQL.Database();
  const tables = await buildTables(db, { customLayers: [{ id: 1, name: "Min Domain", rows }], layers: { litho: [{ hole_id: "H1", from: 0, to: 2, value: "V6" }] } });
  assert.deepEqual(tables.map((x) => x.name), ["custom_min_domain", "litho"]);
  assert.deepEqual(tables[0].columns, ["hole_id", "from", "to", "value", "extra", "description", "modelled"]);
  assert.deepEqual(q(db, "SELECT value FROM custom_min_domain"), [["Min Domain A"]]);
  db.close();
});

test("a custom layer named like a built-in table does not collide with it", async () => {
  const db = new SQL.Database();
  const tables = await buildTables(db, { layers: { litho: [{ hole_id: "H1", from: 0, to: 2, value: "V6" }] }, customLayers: [{ id: 9, name: "litho", rows: [{ hole_id: "H1", from: 0, to: 2, value: "X" }] }] });
  assert.deepEqual(tables.map((x) => x.name), ["custom_litho", "litho"]);
  db.close();
});

test("a big table goes in chunks with progress, and every row arrives (one transaction per table)", async () => {
  const db = new SQL.Database();
  const n = CHUNK_ROWS * 2 + 7;
  const survey = Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 10}`, depth: i, azimuth: 90, dip: 60 }));
  const seen = [];
  await buildTables(db, { survey, collars: [{ hole_id: "H0", x: 0, y: 0, z: 0, dip: 60 }] }, (p) => seen.push(p));
  assert.deepEqual(seen, [{ table: "survey", done: CHUNK_ROWS, total: n }, { table: "survey", done: 2 * CHUNK_ROWS, total: n }]);
  assert.deepEqual(q(db, "SELECT COUNT(*), MIN(dip), MAX(depth) FROM survey"), [[n, -60, n - 1]]);
  assert.deepEqual(q(db, "SELECT dip FROM collars"), [[-60]]);
  db.close();
});

test("the fills run inside transactions; the modal shows progress and passes the custom layers", () => {
  const s = readFileSync(new URL("../src/lib/sqlTables.js", import.meta.url), "utf8");
  assert.match(s, /db\.run\("BEGIN"\)/);
  assert.match(s, /db\.run\("COMMIT"\)/);
  const m = readFileSync(new URL("../src/components/SQLWorkspaceModal.jsx", import.meta.url), "utf8");
  assert.match(m, /customLayers/);
  assert.match(m, /progress/);
  for (const f of ["../src/modules/GeochemModule.jsx", "../src/modules/ViewerModule.jsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    const i = src.indexOf("<SQLWorkspaceModal");
    assert.ok(i > 0 && /customLayers=\{/.test(src.slice(i, i + 900)), f);
  }
});
