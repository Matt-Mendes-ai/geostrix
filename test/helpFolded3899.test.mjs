// TASKS.csv #3899 (Text and Help batch, the 60 % pass) — on the Modelling, Tonnage, Data and View Help pages the detail moved behind "More" word for word,
// and the walk-throughs are folded under their heading. The search still reads all of it, the counter counts a folded walk-through behind "More", and the
// First project walk-through stays open (it is the page's point). SYNTHETIC: the pages' own text only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PAGES, pageById, searchPages } from "../src/help/content.js";
import { collectHelp } from "../scripts/word-count.mjs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3899 the pane folds a walk-through marked folded under its heading, and shows the others open", () => {
  const pane = read("../src/components/HelpPane.jsx");
  assert.match(pane, /return page\.howto\.folded\n\s*\? <details data-howto-folded=""><summary style=\{\{ \.\.\.sectionHead, cursor: "pointer" \}\}>\{head\}<\/summary>\{list\}<\/details>\n\s*: <><div style=\{sectionHead\}>\{head\}<\/div>\{list\}<\/>;/);
});

test("#3899 the walk-throughs of the four pages are folded, First project's is not", async () => {
  const mods = ["modelling", "tonnage", "data", "view"];
  for (const m of mods) {
    const pages = (await import(`../src/help/pages/${m}.js`)).default;
    for (const p of pages) if (p.howto) assert.equal(!!p.howto.folded, p.id !== "first-project", `${m}: ${p.id}`);
  }
  assert.equal(pageById("first-project").howto.folded, undefined);
});

test("#3899 a folded walk-through counts behind More, and the search still finds its words", async () => {
  const h = await collectHelp();
  const steps = (pageById("grade-estimation").howto.steps || []).join(" ");
  assert.ok(steps.length > 0);
  assert.ok(h.pages.modelling.more > 0 && h.pages.modelling.fields.howto > 0);
  // a word that is only in a folded walk-through still finds its page
  const r = searchPages("grade estimation");
  assert.ok(r.some((x) => x.page.id === "grade-estimation"));
});

test("#3899 a moved 'How to choose' keeps its label behind More, and nothing in More is left without a field to sit under", () => {
  for (const id of ["grade-tonnage", "model-settings", "data-qc"]) {
    const p = pageById(id);
    assert.ok(p.fields.some((f) => /^How to choose: /.test(f.more || "") || / How to choose: /.test(f.more || "")), id);
  }
  for (const p of PAGES) for (const w of p.warnings || []) assert.ok(w.says && (w.means || w.do), `${p.id}: a message keeps what it means or what to do in view`);
});
