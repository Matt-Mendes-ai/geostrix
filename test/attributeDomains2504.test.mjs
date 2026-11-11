// TASKS.csv #2504 — sample type and the collar's categorical fields as domains (Grade stats, Compositing, Thresholds) and the collar
// fields as columns of the SQL collars table: 'RC against core against aircore' was answerable only by typing SQL, and not even
// by a join on drill type (the collars table had no Drill_Code).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { attributeDomainOptions, attributeDomainLabel, domainIndex, domainAtMid } from "../src/lib/customDomains.js";
import { buildTables, collarAttrColumns } from "../src/lib/sqlTables.js";
import { drillDomainKeyFn } from "../src/lib/thresholds.js";

const collars = [
  { hole_id: "RC1", x: 0, y: 0, z: 0, attrs: { "hole type": "Reverse circulation (RC)", Drill_Code: "RC", Tenement: "M15/1", Year: 2019 } },
  { hole_id: "DD1", x: 1, y: 0, z: 0, attrs: { "hole type": "Diamond (DD)", Drill_Code: "DD", Tenement: "M15/1", Year: 2020 } },
  { hole_id: "AC1", x: 2, y: 0, z: 0, attrs: { "hole type": "Aircore (AC)", Drill_Code: "AC", Tenement: "M15/2", Year: 2021 } },
  { hole_id: "RC2", x: 3, y: 0, z: 0, attrs: { "hole type": "Reverse circulation (RC)", Drill_Code: "RC", Tenement: "M15/2", Year: 2020 } },
  { hole_id: "AC2", x: 4, y: 0, z: 0, attrs: { "hole type": "Aircore (AC)", Drill_Code: "AC", Tenement: "M15/1", Year: 2019 } },
];
const assays = [
  { hole_id: "RC1", from: 0, to: 1, sample_type: "RC", values: { Li: 1.3 } },
  { hole_id: "RC1", from: 1, to: 2, sample_type: "RC", values: { Li: 1.4 } },
  { hole_id: "DD1", from: 0, to: 2, sample_type: "CORE", values: { Li: 0.6 } },
  { hole_id: "AC1", from: 0, to: 1, sample_type: "AIRCORE", values: { Li: 0.01 } },
];

test("sample type and every categorical collar field become domain options, hole type first", () => {
  const o = attributeDomainOptions(assays, collars);
  // Drill_Code groups the holes exactly as hole type does (RC / DD / AC): not offered twice
  assert.deepEqual(o.map((d) => d.key), ["attr:sample_type", "collar:hole type", "collar:Tenement", "collar:Year"]);
  const st = o[0];
  assert.equal(st.rows.length, 4);
  assert.deepEqual(st.rows[2], { hole_id: "DD1", from: 0, to: 2, value: "CORE" });
  const ht = o[1];
  assert.equal(ht.rows.length, 5);
  assert.ok(ht.rows.every((r) => r.from < 0 && r.to > 1e6), "a collar field spans the whole hole");
});

test("a field grouping the holes differently from hole type is kept", () => {
  const c2 = collars.map((c, i) => ({ ...c, attrs: { ...c.attrs, Drill_Code: i < 3 ? "RC" : "AC" } }));
  assert.ok(attributeDomainOptions([], c2).some((d) => d.key === "collar:Drill_Code"));
});

test("one value, too many values or mostly blank: not a domain", () => {
  assert.deepEqual(attributeDomainOptions(assays.map((a) => ({ ...a, sample_type: "RC" })), []).map((d) => d.key), [], "one sample type");
  assert.deepEqual(attributeDomainOptions(assays.map((a, i) => ({ ...a, sample_type: i ? "" : "RC" })), []).map((d) => d.key), [], "mostly blank");
  const many = Array.from({ length: 40 }, (_, i) => ({ hole_id: `H${i}`, attrs: { id2: `X${i}` } }));
  assert.deepEqual(attributeDomainOptions([], many), [], "40 distinct values is a name, not a domain");
});

test("the domain lookup finds them at any depth: Grade stats / Compositing (domainAtMid) and Thresholds (drillDomainKeyFn)", () => {
  const o = attributeDomainOptions(assays, collars);
  const ix = domainIndex(o.find((d) => d.key === "collar:Tenement").rows);
  assert.equal(domainAtMid(ix, "DD1", 120, 121), "M15/1");
  assert.equal(domainAtMid(ix, "AC1", 0, 1), "M15/2");
  const st = domainIndex(o[0].rows);
  assert.equal(domainAtMid(st, "DD1", 0, 2), "CORE");
  const layers = Object.fromEntries(o.map((d) => [d.key, d.rows]));
  const k = drillDomainKeyFn("attr:sample_type", layers);
  assert.deepEqual(assays.map(k), ["RC", "RC", "CORE", "AIRCORE"]);
  assert.equal(drillDomainKeyFn("collar:hole type", layers)(assays[3]), "Aircore (AC)");
});

test("labels in the reader's language; the stored label stays English", () => {
  const o = attributeDomainOptions(assays, collars);
  const tr = (s, v) => `T(${s.replace("{field}", v?.field ?? "")})`;
  assert.equal(attributeDomainLabel(o[0], tr), "T(Sample type)");
  assert.equal(attributeDomainLabel(o[1], tr), "T(Collar · hole type)");
  assert.equal(o[1].label, "Collar · hole type");
});

test("the SQL collars table carries the collar fields: drill type can be joined", async () => {
  assert.deepEqual(collarAttrColumns(collars.slice(0, 3)), [{ key: "hole type", numeric: false }, { key: "Drill_Code", numeric: false }, { key: "Tenement", numeric: false }, { key: "Year", numeric: true }]);
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const tables = await buildTables(db, { collars: collars.slice(0, 3), assays, assayElements: [{ symbol: "Li" }] });
  assert.deepEqual(tables.find((t) => t.name === "collars").columns, ["hole_id", "x", "y", "z", "azimuth", "dip", "length", "hole type", "Drill_Code", "Tenement", "Year"]);
  const r = db.exec('SELECT c.Drill_Code, ROUND(SUM(a.Li * (a."to" - a."from")) / SUM(a."to" - a."from"), 3) FROM assays a JOIN collars c USING (hole_id) GROUP BY c.Drill_Code ORDER BY c.Drill_Code')[0].values;
  assert.deepEqual(r, [["AC", 0.01], ["DD", 0.6], ["RC", 1.35]]);
  assert.deepEqual(db.exec("SELECT MAX(Year) FROM collars")[0].values, [[2021]]);
  db.close();
  // no attrs: the old seven columns
  const db2 = new SQL.Database();
  const t2 = await buildTables(db2, { collars: [{ hole_id: "H", x: 0, y: 0, z: 0 }] });
  assert.deepEqual(t2.find((t) => t.name === "collars").columns, ["hole_id", "x", "y", "z", "azimuth", "dip", "length"]);
  db2.close();
});

test("the three tools offer them", () => {
  for (const f of ["GradeStatistics", "CompositingModal"]) {
    const s = readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8");
    assert.match(s, /\[\.\.\.attributeDomainOptions\(assays, storeCollars\), \.\.\.customDomainOptions\(customLayers(, \{ layers: storeLayers, labelOf: [^}]*\})?\)/, f); // the built-in extras: #2349
    assert.match(s, /d\.attribute \? attributeDomainLabel\(d, tr\) : d\.label/, f);
  }
  const t = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(t, /attributeDomainOptions\(drillAssays, collars\)/);
  assert.match(t, /drillDomainKeyFn\(groupBy, domainLayers\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["Collar · {field}"] && d["Sample type"], l);
  }
});
