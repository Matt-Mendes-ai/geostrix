// TASKS.csv #3531 — Data QC called a parent and its wedge / daughter holes (JS81-068, JS81-068W1 ... W5) 'a twin or re-drill, a duplicate import, or a coordinate entry error' (24 warnings on
// the Macpass sample, 20 of them wedges by name). A hole whose id is its parent's plus W / D / A and a number, which parts from the parent down the hole, is an info that says so;
// the other pairs stay warnings, now naming the wedge case.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { runDataQC, wedgeFamily } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
const shared = (r) => r.issues.filter((i) => /share a collar and direction|with the same collar \(within/.test(i.message));

test("the real Macpass collars: 20 wedge / daughter groups are infos, the 4 pairs with consecutive numbers stay warnings", () => {
  const r = runDataQC({ project: {}, collars: rd("collars.csv"), survey: rd("survey.csv"), layers: {}, boundaries: [], assays: [] });
  const g = shared(r);
  assert.equal(g.length, 24);
  assert.equal(g.filter((i) => i.severity === "info").length, 20);
  assert.deepEqual(g.filter((i) => i.severity === "warning").map((i) => i.message.match(/\(([^)]*)\)/)[1]).sort(), ["JS81-073, JS81-074", "NB22-003, NB22-004", "TS044, TS045", "TS051, TS052"]);
  const six = g.find((i) => /JS81-068W5/.test(i.message));
  assert.equal(six.severity, "info");
  assert.match(six.message, /^6 holes \(JS81-068, JS81-068W1, JS81-068W2, JS81-068W3, JS81-068W4, JS81-068W5\) share a collar and direction: JS81-068 and its wedge \/ daughter hole\(s\) JS81-068W1, JS81-068W2, JS81-068W3, JS81-068W4, JS81-068W5, normal for wedged holes\.$/);
  assert.match(g.find((i) => i.severity === "warning").message, /: a wedge, twin or re-drill, a duplicate import, or a coordinate error\.$/);
});

const C = (id, length) => ({ hole_id: id, x: 1000, y: 2000, z: 100, length, azimuth: 90, dip: -60 });
const S = (id, rows) => rows.map(([depth, azimuth, dip]) => ({ hole_id: id, depth, azimuth, dip }));

test("the rule: the suffix, the parent, and parting down the hole", () => {
  const ids = ["A1", "A1W1"], byId = new Map([["A1", C("A1", 200)], ["A1W1", C("A1W1", 260)]]);
  assert.deepEqual(wedgeFamily(ids, byId, []), { parent: "A1", kids: ["A1W1"] }, "another length parts it");
  const same = new Map([["A1", C("A1", 200)], ["A1W1", C("A1W1", 200)]]);
  assert.equal(wedgeFamily(ids, same, []), null, "the same length and no surveys: nothing parts it, so it stays a warning");
  const sv = [...S("A1", [[0, 90, -60], [200, 90, -58]]), ...S("A1W1", [[0, 90, -60], [200, 100, -52]])];
  assert.deepEqual(wedgeFamily(ids, same, sv), { parent: "A1", kids: ["A1W1"] }, "another direction at the last station");
  const sv2 = [...S("A1", [[0, 90, -60], [200, 90, -58]]), ...S("A1W1", [[0, 90, -60], [200, 90, -58.5]])];
  assert.equal(wedgeFamily(ids, same, sv2), null, "the same direction at the last station");
  for (const kid of ["A1W2", "A1D1", "A1WD3", "A1A", "A1-W1", "A1_D2", "A1a"]) assert.ok(wedgeFamily(["A1", kid], new Map([["A1", C("A1", 100)], [kid, C(kid, 150)]]), []), kid);
  for (const kid of ["A2", "A1X1", "A1WEDGE", "A1B", "A12"]) assert.equal(wedgeFamily(["A1", kid], new Map([["A1", C("A1", 100)], [kid, C(kid, 150)]]), []), null, kid);
  const two = new Map(["A1", "A1A", "A1AW1"].map((id, i) => [id, C(id, 100 + 50 * i)]));
  assert.deepEqual(wedgeFamily(["A1", "A1A", "A1AW1"], two, []), { parent: "A1", kids: ["A1A", "A1AW1"] }, "a daughter of a daughter");
  assert.equal(wedgeFamily(["B1", "B2", "B2W1"], new Map(["B1", "B2", "B2W1"].map((id) => [id, C(id, 100)])), []), null, "two roots: not one family");
});

test("both messages are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["{n} holes ({ids}) share a collar and direction: {parent} and its wedge / daughter hole(s) {kids}, normal for wedged holes.",
      "Check {n} holes ({ids}) with the same collar (within 1 m) and direction (within 3°): a wedge, twin or re-drill, a duplicate import, or a coordinate error."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`);
  }
});
