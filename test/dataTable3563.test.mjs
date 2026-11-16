// TASKS.csv #3563 / #3569 (Fireweed rehearsal) — a table of the assays and every drillhole log (sort, filter per column, all rows, units in the headings), and Data QC rows that can be
// opened in it, found in 3D and marked as checked; a density flag that says its unit and the sample's grades. Real Macpass tables (used with the owner's permission).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { tableSources, buildTable, parseColumnFilter, applyTable, depthsInMessage } from "../src/lib/dataTable.js";
import { qcKey, qcTableSource, qcTableRequest } from "../src/lib/qcActions.js";
import { runDataQC, gradesAtFn } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
const sg = rd("sg.csv").map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, value: r.sg, method: r.method, low_recovery: r.low_recovery, comment: r.comment, _src: "sg.csv" }));
const assays = rd("assays.csv").map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, values: { Ag: r.Ag_ppm, Pb: r.Pb_pct, Zn: r.Zn_pct } }));
const assayElements = [{ symbol: "Ag", unit: "ppm" }, { symbol: "Pb", unit: "%" }, { symbol: "Zn", unit: "%" }];
const store = { assays, assayElements, layers: { sg }, customLayers: [] };
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));

test("the sources: the assays and each layer with rows, with their counts", () => {
  assert.deepEqual(tableSources(store).map((s) => [s.key, s.count]), [["assays", 32546], ["sg", 32498]]);
  assert.deepEqual(tableSources({}), []);
});

test("the density table: every stored column (method, low_recovery, comment) and the unit in the value's heading; all 32,498 rows", () => {
  const t = buildTable("sg", store);
  assert.deepEqual(t.columns.map((c) => c.label), ["hole_id", "from (m)", "to (m)", "Specific gravity (t/m³)", "method", "low_recovery", "comment"]);
  assert.equal(t.n, 32498); assert.equal(t.rows.length, 32498);
  assert.deepEqual(t.columns.map((c) => c.numeric), [false, true, true, true, false, false, false]);
});

test("the assay table: hole, depths, one column per element with its unit; the values as imported", () => {
  const t = buildTable("assays", store);
  assert.deepEqual(t.columns.map((c) => c.label), ["hole_id", "from (m)", "to (m)", "Ag (g/t)", "Pb (%)", "Zn (%)"]);
  assert.equal(t.n, 32546);
  assert.deepEqual(t.rows[0].slice(0, 3), [assays[0].hole_id, assays[0].from, assays[0].to]);
});

test("filters: '>= 6' finds the six densities above 6 (the review's), '6..7', plain numbers; text: REG, !REG, exact; combined; a search over every column", () => {
  const t = buildTable("sg", store);
  const val = t.columns.findIndex((c) => c.key === "value"), meth = t.columns.findIndex((c) => c.key === "method");
  assert.equal(applyTable(t, { filters: { [val]: ">= 6" } }).length, 6);
  assert.equal(applyTable(t, { filters: { [val]: "6..7" } }).length, 6);
  assert.equal(applyTable(t, { filters: { [val]: "6.918" } }).length, 1);
  assert.equal(applyTable(t, { filters: { [meth]: "REG" } }).length, 6489);
  assert.equal(applyTable(t, { filters: { [meth]: "!REG" } }).length, 32498 - 6489);
  assert.equal(applyTable(t, { filters: { [meth]: "\"LAB-SPG04\"" } }).length, 545);
  assert.equal(applyTable(t, { filters: { [meth]: "reg", [val]: "> 4" } }).length, applyTable(t, { filters: { [val]: "> 4", [meth]: "REG" } }).length, "filters combine");
  assert.equal(parseColumnFilter("", true), null);
  assert.equal(parseColumnFilter("x", true)("abx"), true, "a word in a numeric column falls back to text");
  assert.equal(applyTable(t, { search: "NB23-007" }).length, sg.filter((r) => r.hole_id === "NB23-007").length);
  assert.equal(applyTable(t, { search: "6.918" }).length >= 1, true);
});

test("sort: a click on a heading, ascending then descending; blanks last either way; numbers as numbers; a stable order for ties", () => {
  const small = { columns: [{ key: "a", label: "a", numeric: true }, { key: "b", label: "b", numeric: false }], rows: [[10, "x"], [2, "b"], [null, "c"], [33, "a"], [2, "A"]], n: 5 };
  assert.deepEqual(Array.from(applyTable(small, { sort: { col: 0, dir: 1 } })), [1, 4, 0, 3, 2]);
  assert.deepEqual(Array.from(applyTable(small, { sort: { col: 0, dir: -1 } })), [3, 0, 1, 4, 2]);
  assert.deepEqual(Array.from(applyTable(small, { sort: { col: 1, dir: 1 } })).map((i) => small.rows[i][1]), ["a", "A", "b", "c", "x"]);
  const t = buildTable("sg", store), val = t.columns.findIndex((c) => c.key === "value");
  const top = applyTable(t, { sort: { col: val, dir: -1 } });
  assert.equal(t.rows[top[0]][val], 6.918); assert.equal(t.rows[top[top.length - 1]][val], Math.min(...sg.map((r) => r.value)));
});

test("a QC row's actions: the table source from its category, the hole and the interval named in its message", () => {
  assert.equal(qcTableSource("Specific gravity"), "sg"); assert.equal(qcTableSource("Assays"), "assays"); assert.equal(qcTableSource("Lithology"), "litho");
  assert.equal(qcTableSource("Collars"), null); assert.equal(qcTableSource("Survey"), null);
  const issue = { severity: "warning", category: "Specific gravity", holeId: "NB23-007", message: "Value 6.918 t/m³ at 348.3–349.3m is outside the plausible 1–6 range for Specific gravity — a keying or unit error?" };
  assert.deepEqual(qcTableRequest(issue), { source: "sg", hole: "NB23-007", from: 348.3, to: 349.3 });
  assert.equal(qcTableRequest({ ...issue, holeId: null }), null);
  assert.deepEqual(depthsInMessage("Dogleg 1.0° over 10.0 m between 80 m and 90 m (3.1°/30 m)"), { from: 80, to: 90 });
  assert.equal(depthsInMessage("no depths here"), null);
  assert.equal(qcKey(issue), `Specific gravity|NB23-007|${issue.message}`);
});

test("the checked marks are kept in the project file (project.qcChecked): a store setter, read by Data QC, reversible", () => {
  const st = read("../src/lib/store.jsx");
  assert.match(st, /const setProjectQcChecked = useCallback\(\(list\) => setProject\(\(p\) => \{ const \{ qcChecked: _old, \.\.\.rest \} = p;/);
  assert.match(st, /setProjectDensityRange \/\* #3587 \*\/, setProjectQcChecked \/\* #3569 \*\/,/);
  const q = read("../src/components/DataQCModal.jsx");
  assert.match(q, /const checked = useMemo\(\(\) => new Set\(project\?\.qcChecked \|\| \[\]\), \[project\?\.qcChecked\]\);/);
  assert.match(q, /setProjectQcChecked\?\.\(\[\.\.\.n\]\)/);
  assert.doesNotMatch(q, /localStorage\.\w+\(`?"?geostrix\.qc\.checked/);
  assert.doesNotMatch(read("../src/lib/qcActions.js"), /localStorage/);
});

test("a density flag with its unit and the sample's grades: the real Macpass six", () => {
  const collars = rd("collars.csv");
  const r = runDataQC({ project: {}, collars, survey: [], layers: { sg }, boundaries: [], assays, assayElements });
  const flags = r.issues.filter((i) => i.category === "Specific gravity" && /outside the plausible/.test(i.message));
  assert.equal(flags.length, 6);
  for (const f of flags) assert.match(f.message, /^Value \d\.\d+ t\/m³ at [\d.]+–[\d.]+m is outside the plausible 1–6 range for Specific gravity/);
  const withGrades = flags.filter((f) => /\(the sample there: /.test(f.message));
  assert.ok(withGrades.length >= 4, `${withGrades.length} of the six sit in an assayed interval`);
  const g = gradesAtFn(assays, assayElements)("NB23-016", 134, 134.5);
  assert.match(g, /^(Ag [\d.]+ g\/t, )?Pb [\d.]+ %, Zn [\d.]+ %$/);
  assert.equal(gradesAtFn(assays, [])("NB23-016", 134, 134.5), "");
  assert.equal(gradesAtFn(assays, assayElements)("NO-SUCH", 1, 2), "");
  // another layer's message is as it was
  const geo = runDataQC({ project: {}, collars: [{ hole_id: "A", x: 0, y: 0, z: 0, length: 50 }], survey: [], layers: { geotech: [{ hole_id: "A", from: 0, to: 5, value: 300 }] }, boundaries: [], assays: [] });
  assert.ok(geo.issues.some((i) => /^Value 300 at 0–5m is outside the plausible 0–110 range for Geotech — a keying or unit error\?$/.test(i.message)));
});

test("wired: the ribbon button, the layer inspector's Table, Geochem's Assay table, the App's lazy dialog, the Data QC row buttons and Find in 3D", () => {
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /onClick=\{\(\) => openDataTable\(\{\}\)\}><Rows3 /);
  assert.match(read("../src/components/LayerInspector.jsx"), /openDataTable\(\{ source: layerKey \}\); onClose\(\);/);
  assert.match(read("../src/modules/GeochemModule.jsx"), /onClick=\{\(\) => openDataTable\(\{ source: "assays" \}\)\}/);
  const a = read("../src/App.jsx");
  assert.match(a, /const DrillTableModal = React\.lazy\(\(\) => import\("\.\/components\/DrillTableModal\.jsx"\)\);/);
  assert.match(a, /\{dataTable && <Suspense fallback=\{null\}><DrillTableModal key=\{dataTable\.n\} request=\{dataTable\} onClose=\{\(\) => setDataTable\(null\)\} \/><\/Suspense>\}/);
  const q = read("../src/components/DataQCModal.jsx");
  assert.match(q, /onClick=\{\(\) => openDataTable\(qcTableRequest\(issue\)\)\}/);
  assert.match(q, /onClick=\{\(\) => onZoomHole\(issue\.holeId\)\}/);
  assert.match(q, /const toggleChecked = \(issue\) =>/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /<DataQCModal onCancel=\{\(\) => setQcModalOpen\(false\)\} onZoomHole=\{\(id\) => \{ zoomToHole\(id\); setQcModalOpen\(false\); \}/);
  const m = read("../src/components/DrillTableModal.jsx");
  assert.match(m, /role="columnheader"/); assert.match(m, /useVirtualRows\(order\.length, ROW_H\)/); assert.doesNotMatch(m, /\.slice\(0, 400\)|first 400/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["Data table", "Assay table", "Clear filters", "Unmark", "Hide the {n} rows marked as checked", "Value {v} {unit} at {from}–{to}m is outside the plausible {min}–{max} range for {layer}{grades} — a keying or unit error?"]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`); }
});
