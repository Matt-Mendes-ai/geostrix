// TASKS.csv #3979 (batch C1 of #3967's plan) — the Getting started, Data, Everyday and Output Help pages as cards, on the pilots' pattern (src/help/CardPage.jsx).
// The generic limits (one line of at most 15 words, a picture, 2-4 key settings with gists, every sentence still found) are helpCards3973's, which loops over
// every card page; this file pins what is specific to these twelve: the cautions in view, the routes, the strips, the pictures and the words seen first.
import test from "node:test";
import assert from "node:assert/strict";
import { wordsOf, countHelpPage } from "../scripts/word-count.mjs";

const { pageById, PAGES } = await import("../src/help/content.js");
const C1 = ["first-project", "export-formats", "save-recovery", "help-start", "import-drillholes", "import-density", "data-qc", "view-basics", "import-assays", "downhole-compositing", "grade-statistics", "qaqc"];
const cautions = (id) => pageById(id).cautions.join(" | ").toLowerCase();

test("the twelve pages are cards; First steps (six picture screens) is left as it was", () => {
  for (const id of C1) assert.ok(pageById(id).line, `${id} is a card page`);
  assert.equal(pageById("first-steps").line, undefined);
  assert.ok(pageById("first-steps").guide);
  for (const id of C1) assert.equal(pageById(id).diagram, undefined, `${id}: its diagram moved into picture`);
});

test("every caution is in view, one line each, and the protective ones are there", () => {
  for (const id of C1) for (const c of pageById(id).cautions) assert.ok(wordsOf(c) <= 16, `${id}: "${c}" is one line`);
  assert.match(cautions("first-project"), /a sample is not your project/);
  assert.match(cautions("export-formats"), /no coordinate system: tell the other program/);
  for (const w of ["autosave is a crash copy, not a saved project", "undo does not cover rasters, terrain, block models or generated surfaces", "database passwords are never saved with a project"]) assert.ok(cautions("save-recovery").includes(w), w);
  assert.match(cautions("import-drillholes"), /rows with no hole id, depth or value are left out/); // PROTECTIVE: rows left out
  for (const w of ["kg/m³ is not t/m³: divide by 1000", "no density give a tonnage with no measured density"]) assert.ok(cautions("import-density").includes(w), w); // PROTECTIVE: no density, so no tonnes
  for (const w of ["a clean list means nothing was found", "assumed elevation", "rows left out at import"]) assert.ok(cautions("data-qc").includes(w), w); // PROTECTIVE: assumed elevation, rows left out
  assert.match(cautions("view-basics"), /perspective is not a scale/);
  assert.match(cautions("import-assays"), /a blank is not assayed, not zero/);
  assert.match(cautions("downhole-compositing"), /changes no assay/);
  assert.match(cautions("grade-statistics"), /does not choose a cap/);
  assert.match(cautions("qaqc"), /question for the lab/);
  assert.match(cautions("help-start"), /never picks numbers for you/);
});

test("'Use instead' chips: the plan's routes, each a link to a page that exists", () => {
  const to = (id) => (pageById(id).instead || []).map((x) => x.page);
  assert.deepEqual(to("import-drillholes"), ["import-assays", "point-survey", "map-layers"]);
  assert.deepEqual(to("import-assays"), ["import-drillholes"]);
  assert.deepEqual(to("import-density"), ["downhole-logs"]);
  assert.deepEqual(to("view-basics"), ["import-drillholes"]);
  assert.deepEqual(to("export-formats"), ["save-recovery"]);
  assert.deepEqual(to("first-project"), [undefined], "'their own dialogs' is not one page");
  for (const id of C1) for (const x of pageById(id).instead || []) if (x.page) assert.ok(pageById(x.page), `${id}: ${x.page}`);
});

test("a step strip only where the walk-through was in view (not folded) in the page as it was", () => {
  const strip = (id) => pageById(id).strip;
  assert.deepEqual(strip("first-project"), ["Open Macpass", "Run Data QC", "Open Geochem", "Start your own"]);
  assert.deepEqual(strip("view-basics"), ["Open Macpass", "Turn on Zn", "Filter holes", "Open a strip log"]);
  assert.deepEqual(strip("downhole-compositing"), ["Pick Zn", "Read the table", "Set a cap", "Keep as a layer"]);
  assert.deepEqual(strip("grade-statistics"), ["Pick Zn", "Tick Log scale", "Set a cut-off"]);
  assert.deepEqual(strip("qaqc"), ["Import QC assays", "Read the counts", "Pick an element", "Enter the limit"]);
  for (const id of ["import-drillholes", "import-assays", "import-density", "data-qc", "export-formats", "save-recovery", "help-start"]) assert.equal(strip(id), undefined, `${id}: its walk-through stays folded`);
  for (const id of ["first-project", "view-basics", "downhole-compositing", "grade-statistics", "qaqc"]) assert.ok(pageById(id).strip.length >= 3 && pageById(id).strip.length <= pageById(id).howto.steps.length, `${id}: a short strip of its walk-through`);
});

test("the pictures: N12 on Save, N13 on QAQC, the existing kit on the rest, the three norths beside the azimuth setting", () => {
  assert.equal(pageById("save-recovery").picture.help, "save");
  assert.equal(pageById("qaqc").picture.help, "control");
  assert.equal(pageById("downhole-compositing").picture.help, "composite");
  assert.equal(pageById("first-project").picture.diagram, "workflow");
  assert.equal(pageById("help-start").picture.diagram, "basicAdvanced");
  assert.equal(pageById("import-drillholes").picture.diagram, "filesWhere");
  assert.equal(pageById("import-drillholes").figure.help, "norths");
  for (const id of C1) assert.ok(pageById(id).picture.alt.length > 20, `${id}: an alt sentence`);
  const keys = (id) => pageById(id).keys;
  assert.ok(keys("import-drillholes").includes("Azimuths in this file are measured from"));
});

test("words seen first: each page well under the old count, the twelve about 76 % less", () => {
  const first = (p) => { let n = 0; countHelpPage(p, (_k, text, more) => { if (!more) n += wordsOf(text); }); return n; };
  const before = { "first-project": 179, "export-formats": 415, "save-recovery": 249, "help-start": 149, "import-drillholes": 283, "import-density": 275, "data-qc": 284, "view-basics": 313, "import-assays": 223, "downhole-compositing": 409, "grade-statistics": 196, qaqc: 211 }; // #3967's plan, the counts before
  let was = 0, now = 0;
  for (const id of C1) { const n = first(pageById(id)); assert.ok(n < 90 && n < before[id] * 0.5, `${id}: ${n} words seen first (was ${before[id]})`); was += before[id]; now += n; }
  assert.ok(now < was * 0.3, `${now} of ${was}`);
  assert.equal(PAGES.filter((p) => C1.includes(p.id)).length, C1.length);
});
