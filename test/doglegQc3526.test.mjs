// TASKS.csv #3526 — Data QC on the clean Macpass survey opened with 105 dogleg ERRORS and 1,030 warnings (1,081 rows, 318 of them bends under 2°, the errors
// short-station readings scaled up). A bend counts above the tool's precision, an error needs an angle and a rate no drill string makes, a hole is one row, and the list
// is worst first.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { runDataQC, qcSorted, qcIssueRows, DOGLEG_MIN_DEG, DOGLEG_ERROR_MIN_DEG, DOGLEG_ERROR_DEFAULT } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
const qc = (survey, collars = [{ hole_id: "H1", x: 0, y: 0, z: 0, length: 100, azimuth: 0, dip: -60 }]) => runDataQC({ project: {}, collars, survey, layers: {}, boundaries: [], assays: [] });
const doglegs = (r) => r.issues.filter((i) => /^Dogleg /.test(i.message));
const st = (depth, azimuth, dip) => ({ hole_id: "H1", depth, azimuth, dip });

test("the real Macpass survey: 13 errors and one row per hole, not 105 errors in 1,081 rows", () => {
  const r = qc(rd("survey.csv"), rd("collars.csv"));
  const d = doglegs(r);
  assert.equal(d.filter((i) => i.severity === "error").length, 13);
  assert.equal(d.length, 240, "one row per hole with a bend over 2° and 3°/30 m");
  assert.equal(new Set(d.map((i) => i.holeId)).size, d.length, "a hole is one row");
});

test("a bend under 2° is not counted, however short the spacing; 2° and over at the rate is a warning", () => {
  assert.equal(doglegs(qc([st(0, 0, -60), st(10, 1.5, -60.4)])).length, 0, "about 1.2° of bend");
  assert.equal(DOGLEG_MIN_DEG, 2);
  const r = doglegs(qc([st(0, 0, -60), st(10, 0, -57.5)]));
  assert.equal(r.length, 1); assert.equal(r[0].severity, "warning", "2.5° over 10 m = 7.5°/30 m");
});

test("an error needs the angle above reading noise and a rate over 20°/30 m: 8° over 10 m is 24°/30 m and an error; 6° over 20 m is 9°/30 m and a warning", () => {
  assert.equal(DOGLEG_ERROR_DEFAULT, 20); assert.equal(DOGLEG_ERROR_MIN_DEG, 5);
  assert.equal(doglegs(qc([st(0, 0, -60), st(10, 0, -52)]))[0].severity, "error");
  const w = doglegs(qc([st(0, 0, -60), st(20, 0, -54)]));
  assert.equal(w[0].severity, "warning");
  // a short-spacing reading scaled up (3.4° over 3 m, rated over 10 m: 10.2°/30 m) is a warning, not an error
  const s = doglegs(qc([st(0, 0, -60), st(3, 0, -56.6)]));
  assert.equal(s.length, 1); assert.equal(s[0].severity, "warning"); assert.match(s[0].message, /rated over 10 m, over 3°\/30 m/);
});

test("a hole with several bends is one row: the sharpest, and how many", () => {
  const r = doglegs(qc([st(0, 0, -60), st(30, 0, -56), st(60, 0, -60), st(90, 0, -55), st(120, 0, -60)]));
  assert.equal(r.length, 1);
  assert.match(r[0].message, /^Dogleg 5\.0° over 30\.0 m between 60 m and 90 m \(5\.0°\/30 m, over 3°\/30 m\)/);
  assert.match(r[0].message, /4 bends on this hole are over 3°\/30 m; this is the sharpest\.$/);
  // a single bend says nothing about a count
  assert.doesNotMatch(doglegs(qc([st(0, 0, -60), st(30, 0, -55)]))[0].message, /bends on this hole/);
});

test("the list is worst first: errors, warnings, notes; the survey bends after the other warnings; the CSV uses the same order", () => {
  const issues = [
    { severity: "info", message: "i1" }, { severity: "warning", message: "dogleg", minor: true }, { severity: "warning", message: "w1" },
    { severity: "error", message: "e1" }, { severity: "warning", message: "w2" }, { severity: "error", message: "dogleg err", minor: true }, { severity: "info", message: "i2" },
  ];
  assert.deepEqual(qcSorted(issues).map((i) => i.message), ["e1", "dogleg err", "w1", "w2", "dogleg", "i1", "i2"]);
  assert.deepEqual(qcIssueRows(issues).map((r) => r.message), ["e1", "dogleg err", "w1", "w2", "dogleg", "i1", "i2"]);
  assert.deepEqual(issues.map((i) => i.message)[0], "i1", "the input is not reordered");
});

test("wired: the dialog passes the 20°/30 m error rate, sorts with qcSorted, and its tooltip says what is counted", () => {
  const m = read("../src/components/DataQCModal.jsx");
  assert.match(m, /doglegError: Math\.max\(DOGLEG_ERROR_DEFAULT, warnDeg\)/);
  assert.match(m, /const shown = useMemo\(\(\) => qcSorted\(result\.issues\.filter/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["{n} bends on this hole are over {v}°/30 m; this is the sharpest."], lang);
  }
});
