// TASKS.csv #2453 / #2583 — coded fields of logs and custom layers as evidence, codes folded by case, and per-hole thickness / depth / base
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codedFields, foldedCodes, zoneParts, zoneHolePoints, codedRef, parseCodedRef, codedRowsOf } from "../src/lib/evidenceSources.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

// vertical holes A, B, C at (0, 0), (100, 0), (200, 0), collars at RL 100: a trace is [{ x, y, z, md }]
const trace = (x) => [{ x, y: 0, z: 100, md: 0 }, { x, y: 0, z: 0, md: 100 }];
const traces = new Map([["A", trace(0)], ["B", trace(100)], ["C", trace(200)]]);
const litho = [
  { hole_id: "A", from: 0, to: 10, value: "SAN", strat: "QA", oxidation: "OX", description: "sand, pale" },
  { hole_id: "A", from: 10, to: 16, value: "LIG", strat: "E2", oxidation: "RE", description: "lignite" },
  { hole_id: "A", from: 16, to: 20, value: "lig", strat: "E2", oxidation: "RE", description: "lignite, clayey" },
  { hole_id: "B", from: 0, to: 12, value: "SAN", strat: "QA", oxidation: "OX", description: "sand" },
  { hole_id: "B", from: 12, to: 15, value: "LIG", strat: "e2", oxidation: "RE", description: "lignite again" },
  { hole_id: "C", from: 0, to: 30, value: "SAN", strat: "QA", oxidation: "OX", description: "all sand" },
];

test("coded fields: value first, the extra code fields, never a description, a number or a bookkeeping field", () => {
  const rows = litho.map((r, i) => ({ ...r, _src: "litho.csv", id: i, recovery: 90 + i }));
  assert.deepEqual(codedFields(rows), ["value", "strat", "oxidation"]);
  // a custom layer with a Rock2 code and its percentage: only the code
  assert.deepEqual(codedFields([1, 2, 3, 4].map((i) => ({ hole_id: "A", from: i, to: i + 1, GEOL_Rock2: i % 2 ? "P" : "QV", GEOL_Rock2_pct: 10 * i }))), ["GEOL_Rock2"]);
});

test("codes folded by case, with their spellings, the most used first", () => {
  const c = foldedCodes(litho, traces, { min: 1 });
  assert.deepEqual(c.map((x) => [x.key, x.label, x.n]), [["LIG", "LIG / lig", 3], ["SAN", "SAN", 3]]);
  assert.deepEqual(foldedCodes(litho, traces, { field: "strat", min: 1 }).map((x) => x.label), ["E2 / e2", "QA"]);
  assert.deepEqual(foldedCodes(litho, traces, { min: 3 }).map((x) => x.key), ["LIG", "SAN"]);
});

test("distance parts on another field and folded: lignite in A and B, at every spelling", () => {
  const exact = zoneParts(litho, "LIG", traces);
  assert.equal(exact.length, 2); // A 10-16, B 12-15 (the 'lig' row is another code without folding)
  const folded = zoneParts(litho, "LIG", traces, 5, null, { fold: true });
  assert.equal(folded.length, 3);
  assert.equal(zoneParts(litho, "E2", traces, 5, null, { field: "strat", fold: true }).length, 3);
  assert.equal(zoneParts(litho, "E2", traces, 5, null, { field: "strat" }).length, 2);
});

test("per-hole measures: metres of the code (0 where logged without it), depth to its top, elevation of its base", () => {
  const thick = zoneHolePoints(litho, "LIG", traces, "thick", { fold: true });
  assert.deepEqual(thick.map((p) => [p.x, p.value]).sort((a, b) => a[0] - b[0]), [[0, 10], [100, 3], [200, 0]]);
  assert.equal(thick.find((p) => p.x === 0).z, 85); // the middle of 10-20 m
  const top = zoneHolePoints(litho, "LIG", traces, "top", { fold: true });
  assert.deepEqual(top.map((p) => [p.x, p.value, p.z]).sort((a, b) => a[0] - b[0]), [[0, 10, 90], [100, 12, 88]]); // no top in C: unknown, not 0
  const base = zoneHolePoints(litho, "LIG", traces, "baseZ", { fold: true });
  assert.deepEqual(base.map((p) => [p.x, p.value]).sort((a, b) => a[0] - b[0]), [[0, 80], [100, 85]]);
  // without folding, A's 'lig' 16-20 is not counted
  assert.equal(zoneHolePoints(litho, "LIG", traces, "thick").find((p) => p.x === 0).value, 6);
  // a Level (elevation band) keeps only the points inside it
  assert.equal(zoneHolePoints(litho, "LIG", traces, "thick", { fold: true, level: { zMin: 86, zMax: 99 } }).length, 1); // B at 86.5 m; A at 85, C (none, at its collar) at 100
});

test("the coded ref: round trip, rows of a log or a custom layer, and the cache reads that layer", () => {
  const ref = codedRef({ l: "custom:7", f: "GEOL_Rock2", c: "P", fold: false, how: "thick" });
  assert.deepEqual(parseCodedRef(ref), { l: "custom:7", f: "GEOL_Rock2", c: "P", fold: false, how: "thick" });
  assert.equal(parseCodedRef("litho:SAN"), null);
  const custom = [{ id: 7, rows: [{ hole_id: "A" }] }];
  assert.equal(codedRowsOf("custom:7", {}, custom), custom[0].rows);
  assert.equal(codedRowsOf("litho", { litho }, custom), litho);
  const deps = evidenceDeps({ kind: "numeric", ref }, {}, { customLayers: custom, collars: 1, survey: 2, desurveyMethod: 3 });
  assert.equal(deps[0], custom[0].rows);
  assert.deepEqual(evidenceDeps({ kind: "zone", ref: "litho:SAN" }, {}, { projectLayers: { litho }, collars: 1, survey: 2, desurveyMethod: 3 }), [litho, 1, 2, 3]); // the old card as before
});

test("the pane offers them, keeps the old key of a built-in log's code, and reads custom layers", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /builtIn && field === "value" && !fold\) out\.push\(\{ key: `zone:\$\{l\}:\$\{c\.label\}`/);
  assert.match(p, /for \(const cl of customLayers \|\| \[\]\) if \(cl\.rows\?\.length\) codeCards\(out, `custom:\$\{cl\.id\}`/);
  assert.match(p, /if \(z\) return zoneHolePoints\(/);
});
