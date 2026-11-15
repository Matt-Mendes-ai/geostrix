// TASKS.csv #3530 — Data QC said nothing about what the project lacks: no log of any kind, assayed intervals with no density, how many densities are of each method,
// the unsampled metres between samples. Four coverage infos, counted on the real Macpass tables (no logs; the densities carry a method field).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { coverageInfos } from "../src/lib/dataQcCoverage.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
const collars = rd("collars.csv");
const sg = rd("sg.csv").map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, value: r.sg, method: r.method, low_recovery: r.low_recovery }));
const assays = rd("assays.csv").map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, values: { Ag: r.Ag_ppm } }));
const infos = (o) => coverageInfos({ collars, layers: {}, assays: [], ...o });
const find = (list, re) => list.find((i) => re.test(i.message));

test("no log of any kind: said once, naming what the holes do carry", () => {
  const m = find(infos({ layers: { sg }, assays }), /^No lithology/);
  assert.equal(m.category, "Logs");
  assert.match(m.message, /the 559 holes carry only assays and densities, so modelling tools have no logged contacts to build from\.$/);
  assert.match(find(infos({ assays }), /^No lithology/).message, /carry only assays,/);
  assert.match(find(infos({ layers: { sg } }), /^No lithology/).message, /carry only densities,/);
  assert.ok(!find(infos({}), /^No lithology/), "a project of collars alone has not got as far as logs");
});

test("a lithology (or any) log, or a custom layer with rows, silences it; no collars, nothing", () => {
  assert.ok(!find(infos({ layers: { litho: [{ hole_id: collars[0].hole_id, from: 0, to: 5, value: "GR" }] } }), /^No lithology/));
  assert.ok(!find(infos({ customLayers: [{ name: "x", rows: [{ hole_id: "A", from: 0, to: 1 }] }] }), /^No lithology/));
  assert.deepEqual(coverageInfos({ collars: [], layers: {}, assays: [] }), []);
});

test("assayed intervals no density overlaps: counted for holes that have densities, the worst holes named (Macpass: TS041 9, TS033 8, TS036 8, TS031 7)", () => {
  const m = find(infos({ layers: { sg }, assays }), /assayed interval\(s\) in/);
  assert.equal(m.category, "Specific gravity");
  assert.match(m.message, /^47 assayed interval\(s\) in 14 hole\(s\) that have densities have no Specific gravity interval overlapping them \(TS041 9, TS033 8, TS036 8, TS031 7, …\)/);
  const none = infos({ layers: { sg: [{ hole_id: "A", from: 0, to: 2, value: 2.7 }] }, collars: [{ hole_id: "A" }], assays: [{ hole_id: "A", from: 1, to: 3 }, { hole_id: "A", from: 2, to: 4 }, { hole_id: "A", from: 0, to: 1 }] });
  assert.match(find(none, /assayed interval\(s\) in/).message, /^1 assayed interval\(s\) in 1 hole\(s\)/, "overlap, not touching: 2-4 has none; 1-3 and 0-1 overlap the 0-2 density");
  assert.ok(!find(infos({ layers: { sg }, assays: [] }), /assayed interval/), "no assays, nothing to say");
});

test("the method field's values, with their shares: MEAS / REG / LAB on the real densities", () => {
  const m = find(infos({ layers: { sg } }), /rows by 'method'/);
  assert.equal(m.category, "Specific gravity");
  assert.match(m.message, /^Specific gravity rows by 'method': MEAS 25,464 \(78%\), REG 6,489 \(20%\), LAB-SPG04 545 \(2%\)\.$/);
  assert.ok(!find(infos({ layers: { sg: [{ hole_id: "A", from: 0, to: 1, value: 2.7, method: "REG" }, { hole_id: "A", from: 1, to: 2, value: 2.8, method: "REG" }] } }), /by 'method'/), "one kind only: nothing to say");
  assert.ok(!find(infos({ layers: { sg: sg.map(({ method, ...r }) => r) } }), /by 'method'/), "no method field");
});

test("unsampled gaps between samples inside the sampled range, over 5 cm; samples that overlap or touch are not gaps", () => {
  const a = (f, t) => ({ hole_id: "A", from: f, to: t });
  const m = find(infos({ collars: [{ hole_id: "A" }], assays: [a(0, 2), a(2, 4), a(6, 8), a(7.5, 9), a(9.02, 10), a(12, 13), a(30, 31)] }), /unsampled gap/);
  assert.equal(m.category, "Assays");
  assert.match(m.message, /^3 unsampled gap\(s\) of more than 0\.05 m lie between samples inside the sampled range of 1 hole\(s\), 21 m in all:/, "4-6 (2 m), 10-12 (2 m), 13-30 (17 m); 9-9.02 is rounding");
  assert.ok(!find(infos({ collars: [{ hole_id: "A" }], assays: [a(0, 2), a(2, 4)] }), /unsampled gap/));
  const real = find(infos({ layers: { sg }, assays }), /unsampled gap/);
  assert.match(real.message, /^\d{3} unsampled gap\(s\) of more than 0\.05 m lie between samples inside the sampled range of \d{3} hole\(s\)/);
});

test("the sentences are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["{layer} rows by '{field}': {list}.", "No lithology, alteration, vein, structure or other log is in the project: the {n} holes carry only assays, so modelling tools have no logged contacts to build from."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`);
  }
});
