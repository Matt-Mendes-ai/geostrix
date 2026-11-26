// TASKS.csv #4102 — three dialogs said too much: Data QC listed a line per bad interval; Best intercepts carried its intro, sort hint and cautions and every row; Isocon asked
// for the groups interval by interval. Now: Data QC is one line per check with a count and a Show fold; Best intercepts keeps only what is true of the data, the rest is
// in its "?" card, and lists the first 20 rows with Show all; Isocon picks the precursor and altered groups by a log code with counts, the interval lists behind a fold.
// The reachable set is pinned: nothing was removed, only folded or moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { groupByCheck } from "../src/lib/dataQC.js";
import { codeGroups, switchCode } from "../src/lib/isoconGroups.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const qc = read("../src/components/DataQCModal.jsx"), bi = read("../src/components/BestIntercepts.jsx"), iso = read("../src/components/IsoconTool.jsx"), help = read("../src/help/pages/everyday.js");

test("groupByCheck: one entry per check, the worst checks first, then the longest; each keeps its issues in order", () => {
  const I = (category, severity, n) => ({ category, severity, message: `${category} ${n}`, holeId: `H${n}` });
  const g = groupByCheck([I("Overlap", "warning", 1), I("Survey", "info", 2), I("Overlap", "error", 3), I("Gap", "warning", 4), I("Gap", "warning", 5), I("Gap", "warning", 6), I("Survey", "info", 7)]);
  assert.deepEqual(g.map((x) => [x.category, x.sev, x.issues.length]), [["Overlap", "error", 2], ["Gap", "warning", 3], ["Survey", "info", 2]]);
  assert.deepEqual(g[1].issues.map((i) => i.holeId), ["H4", "H5", "H6"]);
  assert.deepEqual(groupByCheck([]), []);
});

test("Data QC: a line per check (count, Show / Hide) and, opened, the rows with Table, Find and Checked; the category dropdown is gone; the filters, export and fixes stay", () => {
  assert.match(qc, /groups\.map\(\(g\) => <QcCheck key=\{g\.category\}/);
  assert.match(qc, /function QcCheck/);
  assert.match(qc, /\{open \? tr\("Hide"\) : tr\("Show"\)\}/);
  assert.match(qc, /\{g\.issues\.length\.toLocaleString\(\)\}/);
  const rows = qc.slice(qc.indexOf("function QcRows"));
  for (const needle of ['tr("Table")', 'tr("Find")', 'tr("Unmark") : tr("Checked")', "openDataTable(qcTableRequest(issue))", "onZoomHole(issue.holeId)", "useVirtualRows("]) assert.ok(rows.includes(needle), `a check's rows: ${needle}`);
  assert.ok(!qc.includes('tr("Filter by category")') && !qc.includes('"All categories ({n})"'), "no category dropdown: each check is its line");
  for (const needle of ["toggleSeverity(sev)", "exportIssues", "snapToTerrain", "requestCollarZFromTerrain", "setHideChecked", 'tr("Re-run")', 'tr("Limits")']) assert.ok(qc.includes(needle), `still there: ${needle}`);
});

test("Best intercepts: the first 20 rows and Show all; the intro, the sort hint, the uncut caution and the standing notes are out of the dialog and in the help page", () => {
  assert.match(bi, /const SHOW_FIRST = 20;/);
  assert.match(bi, /useVirtualRows\(showAll \? results\.length : Math\.min\(results\.length, SHOW_FIRST\)/);
  assert.match(bi, /useVirtualRows\(showAll \? holeRows\.length : Math\.min\(holeRows\.length, SHOW_FIRST\)/);
  assert.equal(bi.split('tr("Show all {n}"').length - 1, 2, "one Show all under the table, one under the per-hole table");
  for (const gone of ['"Composited downhole intersections above a cutoff', '"Click a column heading to sort; the CSV and the Layout table follow this order."', '"Intercepts never average below the cutoff.', '"This is a screening tool — verify any intercept you plan to report externally', '"Sorted by grade × length (best intercepts first)."']) assert.ok(!bi.includes(gone), `out of the dialog: ${gone.slice(0, 40)}`);
  // what is true of THIS data stays: QC samples left out, a cut applied, metal in two samples, pXRF left out, duplicates / overlaps / negatives, samples with no density
  for (const kept of ["qaqcExcludedCount > 0 && !includeQAQC", "topCutStored != null ? cutNote", "intercept(s) have half their metal in two samples", "pXRF reading(s) left out", "duplicatesSkipped", "noDensitySamples > 0 ? weightNote"]) assert.ok(bi.includes(kept), `still said: ${kept}`);
  // the "?" card carries what left
  const page = help.slice(help.indexOf('id: "best-intercepts"'), help.indexOf('id: "best-intercepts"') + 6000);
  for (const said of ["Click a column heading to sort; the CSV and the Layout table follow that order", "uncut", "below-detection values are taken at half the detection limit", "Screening only", "Lengths are downhole"]) assert.ok(page.includes(said), `in the help page: ${said}`);
  // the exports and the Layout table still use every row (results), not the first 20
  assert.match(bi, /const allRows = results\.slice\(0, printed\)/);
});

test("codeGroups: the intervals by log code, the most first; an interval with no code is in no group", () => {
  const rows = [1, 2, 3, 4, 5, 6].map((n) => ({ a: { n }, id: `r${n}` }));
  const code = { 1: "CHL", 2: "CHL", 3: "SER", 4: "", 5: "SER", 6: "SER" };
  const g = codeGroups(rows, (a) => code[a.n]);
  assert.deepEqual(g.map((x) => [x.code, x.ids]), [["SER", ["r3", "r5", "r6"]], ["CHL", ["r1", "r2"]]]);
  assert.deepEqual(codeGroups([], () => "X"), []);
});

test("switchCode: a code goes into a group, out of it when all are in, and out of the other group on the way in", () => {
  const ids = ["a", "b"];
  let r = switchCode(ids, new Set(), new Set(["b", "z"]));
  assert.deepEqual([...r.mine].sort(), ["a", "b"]); assert.deepEqual([...r.other], ["z"]);
  r = switchCode(ids, r.mine, r.other);
  assert.deepEqual([...r.mine], []); assert.deepEqual([...r.other], ["z"], "going out takes nothing from the other group");
  r = switchCode(ids, new Set(["a"]), new Set()); // partly in: all in
  assert.deepEqual([...r.mine].sort(), ["a", "b"]);
});

test("Isocon: pick a layer, a line per code with its count and Precursor / Altered switches; the filter, the hole list and both interval lists are behind the 'By interval…' fold; Clear stays outside", () => {
  assert.match(iso, /<option value="">\{tr\("— pick a layer —"\)\}<\/option>/);
  assert.match(iso, /codeGroups\(rows, \(a\) => codeAt\(ix, a\.hole_id, a\.from, a\.to\)\)/);
  assert.match(iso, /\{ids\.length\.toLocaleString\(\)\}/);
  assert.match(iso, /aria-pressed=\{inP\} onClick=\{\(\) => switchP\(ids\)\}/);
  assert.match(iso, /aria-pressed=\{inA\} onClick=\{\(\) => switchA\(ids\)\}/);
  const fold = iso.slice(iso.indexOf('<MoreFold summary={tr("By interval…")}'), iso.indexOf("const immobileStep"));
  for (const needle of ['placeholder={tr("Filter by hole ID…")}', 'tr("Add intervals by filter")', 'tr("Add to precursor")', 'tr("Add to altered")', "<IntervalList title={tr(\"Precursor\")}", "<IntervalList title={tr(\"Altered\")}", 'aria-label={tr("Second layer")}', 'aria-label={tr("Depth from (m)")}']) assert.ok(fold.includes(needle), `in the fold: ${needle}`);
  const above = iso.slice(0, iso.indexOf('<MoreFold summary={tr("By interval…")}'));
  assert.ok(above.includes('tr("Clear precursor")') && above.includes('tr("Clear altered")'), "Clear stays in view");
  assert.ok(!fold.includes('tr("Clear precursor")'), "Clear is not inside the fold any more");
});

test("the new words are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["— pick a layer —", "By interval…", "{n} checked"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
