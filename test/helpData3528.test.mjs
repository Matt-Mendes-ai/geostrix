// TASKS.csv #3528 — Help had no page on importing drillholes, assays, density or Data QC, and did not know the word Macpass. Five pages (a first-project walk-through on the
// bundled sample, the drillhole import, the assay import, the density layer, Data QC), found by the words the dialogs use, with a '?' in each dialog.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PANE_HELP, HELP_AREAS, helpIdForPane } from "../src/lib/help.js";
import { PAGES, pageById, searchPages } from "../src/help/content.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const IDS = ["first-project", "import-drillholes", "import-assays", "import-density", "data-qc"];

test("the five pages exist, are mapped from their dialog titles, and sit in a known area", () => {
  for (const id of IDS) { assert.ok(pageById(id), id); assert.ok(HELP_AREAS.includes(pageById(id).area), `${id}: area`); }
  assert.equal(helpIdForPane("Import drillhole data"), "import-drillholes");
  assert.equal(helpIdForPane("Import assays"), "import-assays");
  assert.equal(helpIdForPane("Import density (Specific gravity)"), "import-density");
  assert.equal(helpIdForPane("Drillhole data QA/QC"), "data-qc", "the Data QC dialog's own title");
  assert.equal(helpIdForPane("First project"), "first-project");
  assert.equal(pageById("first-project").area, "Getting started"); assert.equal(pageById("import-assays").area, "Geochem");
});

test("search finds them by the words a first-time user types", () => {
  const top = (q) => searchPages(q).map((r) => r.page.id);
  assert.ok(top("Macpass").includes("first-project"), "Macpass");
  assert.ok(top("Data QC").includes("data-qc"), "Data QC");
  assert.equal(top("dogleg")[0], "data-qc");
  assert.ok(top("collar survey import").includes("import-drillholes"));
  assert.ok(top("dip sign").includes("import-drillholes"));
  assert.ok(top("blank cell assay").includes("import-assays") || top("not assayed").includes("import-assays"));
  assert.ok(top("detection").includes("import-assays"));
  assert.ok(top("density t/m³").includes("import-density"));
  assert.equal(top("specific gravity")[0] === "import-density" || top("specific gravity").includes("import-density"), true);
  assert.ok(top("unsampled").includes("data-qc"));
});

test("the field names are the dialogs' own labels, word for word", () => {
  const m = read("../src/components/ImportMappingModal.jsx"), a = read("../src/components/AssayImportModal.jsx"), q = read("../src/components/DataQCModal.jsx");
  const drill = pageById("import-drillholes").fields.map((f) => f.name);
  for (const n of ["What kind of data is this?", "Column mapping", "Dip sign convention", "Azimuths in this file are measured from", "Units", "Extra fields (optional)"]) {
    assert.ok(drill.includes(n), `help names ${n}`); assert.ok(m.includes(`tr("${n}")`), `dialog says ${n}`);
  }
  const assay = pageById("import-assays").fields.map((f) => f.name).join(" | ");
  for (const n of ["Wide format (column per element)", "Long format (row per analyte)", "Not assayed (leave blank)", "QC columns (optional)"]) { assert.ok(assay.includes(n), `help names ${n}`); assert.ok(a.includes(`tr("${n}")`), `dialog says ${n}`); }
  assert.ok(assay.includes("Not assayed — left out of grades (intercepts, composites, statistics) and reported as unsampled metres"));
  assert.ok(a.includes("Not assayed — left out of grades (intercepts, composites, statistics) and reported as unsampled metres"));
  const qc = pageById("data-qc").fields.map((f) => f.name);
  for (const n of ["Dogleg over", "Collar vs terrain over", "Filter by category", "Export CSV", "Re-run"]) { assert.ok(qc.includes(n), `help names ${n}`); assert.ok(q.includes(`tr("${n}")`), `dialog says ${n}`); }
});

test("the page's numbers are the app's: the dogleg rule and the plausible density range", async () => {
  const { DOGLEG_MIN_DEG, DOGLEG_ERROR_MIN_DEG, DOGLEG_ERROR_DEFAULT } = await import("../src/lib/dataQC.js");
  const f0 = pageById("data-qc").fields.find((f) => f.name === "Dogleg over"), t = `${f0.what} ${f0.more || ""}`; // #3899: the detail is behind "More"
  assert.ok(t.includes(`under ${DOGLEG_MIN_DEG}°`) && t.includes(`${DOGLEG_ERROR_DEFAULT}° per 30 m or more, over at least ${DOGLEG_ERROR_MIN_DEG}°`), t);
});

test("a '?' in the drillhole import, the assay import and Data QC opens its page; the density dialog opens the density page", () => {
  const m = read("../src/components/ImportMappingModal.jsx"), a = read("../src/components/AssayImportModal.jsx"), q = read("../src/components/DataQCModal.jsx");
  // #4070 — the two import dialogs show a short card under their ? with a link to the page (DialogHelpCard); Data QC opens its page from its own button
  assert.match(m, /<DialogHelpCard page=\{modal\.target === "sg" \? "import-density" : "import-drillholes"\}/);
  assert.match(a, /<DialogHelpCard page="import-assays"/);
  assert.match(q, /onClick=\{\(\) => openHelp\("data-qc"\)\}/);
  assert.match(q, /import \{ openHelp \} from "\.\.\/lib\/help\.js"/);
  assert.match(read("../src/components/DialogHelpCard.jsx"), /openHelp\(page\)/);
});

test("no page mentions a backlog number or a person's name; every page is in Canadian spelling", () => {
  for (const id of IDS) {
    const p = pageById(id), t = JSON.stringify(p);
    assert.doesNotMatch(t, /TASKS|#\d{3,}|Side \d|Main\b/, id);
    assert.doesNotMatch(t, /\b(color|center|meter|gray|modeling|labeled|behavior|neighbor)s?\b/i, id);
  }
});
