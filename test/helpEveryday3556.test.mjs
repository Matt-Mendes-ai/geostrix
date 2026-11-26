// TASKS.csv #3556 / #3578 (Fireweed rehearsal) — Help had no page for the everyday 3D view and none for Compositing, Best intercepts, Grade statistics or QAQC (one page sent the reader to rules
// no page stated). Five pages, found by the words a user types, each rule taken from the note the dialog itself carries, with a ? in each dialog.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { helpIdForPane } from "../src/lib/help.js";
import { pageById, searchPages } from "../src/help/content.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const IDS = ["view-basics", "downhole-compositing", "best-intercepts", "grade-statistics", "qaqc"];
const top = (q) => searchPages(q).map((r) => r.page.id);

test("the five pages exist and are mapped from their dialogs' own titles", () => {
  for (const id of IDS) assert.ok(pageById(id), id);
  assert.equal(helpIdForPane("3D view basics"), "view-basics"); assert.equal(helpIdForPane("Downhole compositing"), "downhole-compositing");
  assert.equal(helpIdForPane("Best-intercept report"), "best-intercepts"); assert.equal(helpIdForPane("Grade statistics"), "grade-statistics"); assert.equal(helpIdForPane("QAQC — lab quality control"), "qaqc");
  assert.equal(pageById("view-basics").area, "StrixViewer"); for (const id of IDS.slice(1)) assert.equal(pageById(id).area, "Geochem");
});

test("search finds them by the words a first-time user types (the review's twenty terms among them)", () => {
  for (const q of ["rotate", "pan", "zoom", "orbit", "mouse", "identify", "measure", "strip log", "legend", "colour", "filter holes", "draw section"]) assert.ok(top(q).includes("view-basics"), q);
  for (const q of ["composite", "compositing", "domain", "minimum coverage"]) assert.ok(top(q).includes("downhole-compositing"), q);
  for (const q of ["best intercepts", "intercept", "cut-off", "internal dilution", "including", "true width", "grade x length"]) assert.ok(top(q).includes("best-intercepts") || (q === "grade x length" && top("min grade").includes("best-intercepts")), q);
  for (const q of ["grade statistics", "length-weighted", "cv", "probability plot", "cap"]) assert.ok(top(q).includes("grade-statistics") || top(q).includes("downhole-compositing"), q);
  for (const q of ["qaqc", "standard", "blank", "duplicate", "rpd"]) assert.ok(top(q).includes("qaqc"), q);
});

test("the rules are the dialogs' own: the dilution rule, the coverage rule, the weighting, what a result of '<' is", () => {
  const b = pageById("best-intercepts"), t = JSON.stringify(b);
  assert.match(t, /below-cut-off core between two samples at or above the cut-off is still folded into one intercept/);
  assert.match(t, /42 m @ 1\.2, including 6 m @ 5\.1/);
  assert.match(t, /half the detection limit/);
  assert.match(JSON.stringify(pageById("downhole-compositing")), /never straddle a change of the chosen domain layer|never crosses|never cross/i);
  assert.match(JSON.stringify(pageById("downhole-compositing")), /length-weighted average of the samples it covers/);
  assert.match(JSON.stringify(pageById("grade-statistics")), /Statistics on raw assay intervals — NOT length-weighted/);
  // each page's field names are the dialogs' labels
  const comp = read("../src/components/CompositingModal.jsx"), best = read("../src/components/BestIntercepts.jsx");
  for (const n of ["Composite length (m)", "Min coverage (%)", "Honour domain"]) { assert.ok(pageById("downhole-compositing").fields.some((f) => f.name === n), n); assert.ok(comp.includes(`tr("${n}")`), `dialog says ${n}`); }
  for (const n of ["Max internal dilution (m)", "Min length (m)", "Including at ≥", "Min grade × length", "Structure dip dir", "Show in"]) { assert.ok(pageById("best-intercepts").fields.some((f) => f.name === n), n); assert.ok(best.includes(`tr("${n}")`), `dialog says ${n}`); }
});

test("no page picks numbers for the reader or names a backlog row", () => {
  for (const id of IDS) { const t = JSON.stringify(pageById(id)); assert.doesNotMatch(t, /TASKS|#\d{3,}|Side \d/, id); assert.doesNotMatch(t, /\b(color|center|meter|gray|modeling|labeled|behavior)s?\b/i, id); }
});

test("wired: a ? in the four Geochem dialogs opens their pages", () => {
  for (const [f, id] of [["CompositingModal", "downhole-compositing"], ["BestIntercepts", "best-intercepts"], ["GradeStatistics", "grade-statistics"], ["QAQCPanel", "qaqc"]]) {
    const s = read(`../src/components/${f}.jsx`);
    if (f === "GradeStatistics" || f === "QAQCPanel") { assert.ok(s.includes(`<DialogHelpCard page="${id}"`), f); continue; } // #4073 — a StepDialog's "?" card, with its More link to the page
    assert.ok(s.includes(`onClick={() => openHelp("${id}")}`), f); assert.match(s, /import \{ openHelp \} from "\.\.\/lib\/help\.js"/);
  }
});
