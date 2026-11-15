// TASKS.csv #3597 / #3603 / #3622 (Fireweed rehearsal) — Help had no page for the Grade-tonnage table, the Block calculator, the Unsampled metres choice, the Layout tab, the Maps plan view, the exports or
// saving / autosave / recovery / Undo, and the Grade shell and Grade estimation pages showed raw placeholders ('Cutoff ({unit})'). Eight pages found by the words a user types, a "?" in each dialog.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { helpIdForPane, HELP_AREAS } from "../src/lib/help.js";
import { pageById, searchPages } from "../src/help/content.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const IDS = ["grade-tonnage", "block-calculator", "unsampled-metres", "layout", "layout-title-block", "maps-plan-view", "export-formats", "save-recovery"];
const top = (q) => searchPages(q).map((r) => r.page.id);

test("the eight pages exist, in a known area, and are mapped from their titles", () => {
  for (const id of IDS) { const p = pageById(id); assert.ok(p, id); assert.ok(HELP_AREAS.includes(p.area), `${id}: ${p.area}`); assert.equal(helpIdForPane(p.title), id, p.title); }
  assert.equal(pageById("layout").area, "Layout"); assert.equal(pageById("maps-plan-view").area, "Maps");
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))["Layout"], `${lang}: the Layout area has a translation`);
  for (const id of IDS) for (const r of pageById(id).related || []) assert.ok(pageById(r), `${id} -> ${r}`);
});

test("search finds them by the words a geologist types", () => {
  for (const q of ["tonnage", "cutoff", "density", "tonnes", "grade-tonnage"]) assert.ok(top(q).includes("grade-tonnage"), q);
  for (const q of ["block calculator", "formula", "zinc equivalent"]) assert.ok(top(q).includes("block-calculator"), q);
  for (const q of ["unsampled", "barren", "not known"]) assert.ok(top(q).includes("unsampled-metres"), q);
  for (const q of ["title block", "paper size", "Tabloid", "scale bar", "credit", "{credits}", "convergence", "export pdf", "letter", "north arrow", "legend"]) assert.ok(top(q).some((i) => ["layout", "layout-title-block"].includes(i)), q);
  for (const q of ["hole ids", "collar colours", "plan view"]) assert.ok(top(q).includes("maps-plan-view"), q);
  for (const q of ["export", "leapfrog", "micromine", "shapefile", "dxf", "kmz", "omf", "geoh5", "dip"]) assert.ok(top(q).includes("export-formats"), q);
  for (const q of ["autosave", "recover", "undo", "crash", "language", "save"]) assert.ok(top(q).includes("save-recovery"), q);
});

test("the rules are the app's own: the 60 s autosave, the dip sign, the OMF's numbers-only, the title block tokens, the paper sizes", () => {
  const s = JSON.stringify(pageById("save-recovery")), e = JSON.stringify(pageById("export-formats")), l = JSON.stringify(pageById("layout")), tb = JSON.stringify(pageById("layout-title-block"));
  assert.match(s, /Every 60 seconds/); assert.match(s, /Recovered unsaved work/); assert.match(s, /Rasters, terrain, block models and generated surfaces are not undoable/);
  assert.match(e, /negative = down/); assert.match(e, /epsg column/); assert.match(e, /provenance\.txt/); assert.match(e, /numbers only/);
  for (const sz of ["A4", "A3", "A2", "A1", "A0", "Letter", "Legal", "Tabloid"]) assert.ok(l.includes(sz), sz);
  for (const tok of ["{project}", "{date}", "{page}", "{pages}", "{pagename}", "{scale}", "{crs}", "{credits}", "{north}", "{convergence}"]) assert.ok(tb.includes(tok), tok);
  // the constants quoted are the code's
  assert.match(read("../src/lib/store.jsx"), /AUTOSAVE_INTERVAL_MS = 60000/);
  const fmt = read("../src/lib/pageFormats.js"); for (const k of ["a4", "a3", "a2", "a1", "a0", "letter", "legal", "tabloid"]) assert.match(fmt, new RegExp(`\\b${k}: \\{ label`));
  // each field a page names is a label the dialog shows
  const gt = read("../src/components/GradeTonnageModal.jsx"), bc = read("../src/components/BlockCalculatorModal.jsx"), uc = read("../src/components/UnsampledChoice.jsx");
  for (const n of ["Density by", "By bench", "Bench height (m)", "Datum (m)", "Inside the solid", "Export CSV"]) assert.ok(gt.includes(`tr("${n}")`), n);
  for (const n of ["Block models in the formula", "Formula", "Name of the new block model", "Unit of the new value"]) assert.ok(bc.includes(`tr("${n}")`), n);
  assert.ok(uc.includes('tr("Unsampled metres inside a sampled hole")'));
});

test("the Grade shell and Grade estimation pages print no raw placeholder in a field name or a message, and carry the fields the review missed", () => {
  for (const id of ["grade-shell", "grade-estimation"]) {
    const p = pageById(id);
    for (const f of p.fields) assert.doesNotMatch(f.name, /\{[A-Za-z]+\}/, `${id}: ${f.name}`);
    for (const w of p.warnings) assert.doesNotMatch(w.says, /\{[A-Za-z]+\}/, `${id}: ${w.says.slice(0, 50)}`);
  }
  const gs = pageById("grade-shell").fields.map((f) => f.name), ge = pageById("grade-estimation").fields.map((f) => f.name);
  assert.ok(gs.includes("Unsampled metres inside a sampled hole") && gs.includes("Cell height (m)"));
  for (const n of ["Source", "Also estimate other elements… / Top cut", "Only blocks below the ground", "Grade-tonnage and Block calculator"]) assert.ok(ge.includes(n), n);
  assert.ok(pageById("grade-estimation").related.includes("grade-tonnage") && pageById("grade-shell").related.includes("unsampled-metres"));
});

test("no page picks numbers for the reader, names a backlog row or uses American spelling", () => {
  for (const id of IDS) { const t = JSON.stringify(pageById(id)); assert.doesNotMatch(t, /TASKS|#\d{3,}|Side \d/, id); assert.doesNotMatch(t, /\b(color|center|meter|gray|modeling|labeled|behavior|favorite|neighbor)s?\b/i, id); }
});

test("wired: a ? in the Grade-tonnage and Block calculator dialogs and in the Layout page bar opens their pages", () => {
  for (const [f, id] of [["components/GradeTonnageModal.jsx", "grade-tonnage"], ["components/BlockCalculatorModal.jsx", "block-calculator"], ["modules/LayoutModule.jsx", "layout"]]) {
    const s = read(`../src/${f}`); assert.ok(s.includes(`onClick={() => openHelp("${id}")}`), f); assert.match(s, /import \{ openHelp \} from "\.\.\/lib\/help\.js"/);
  }
  assert.match(read("../src/help/content.js"), /import tonnage from "\.\/pages\/tonnage\.js"[\s\S]*import layout from "\.\/pages\/layout\.js"[\s\S]*import output from "\.\/pages\/output\.js"/);
});
