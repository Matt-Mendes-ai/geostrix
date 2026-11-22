// TASKS.csv #3983 (batch C5 of #3967's plan) — the four Targeting pages as cards, on the pilots' pattern (src/help/CardPage.jsx), with existing pictures.
// The generic limits (one line, a picture, 2-4 key settings with gists, every sentence still found) are helpCards3973's, which loops over every card page.
import test from "node:test";
import assert from "node:assert/strict";
import { wordsOf } from "../scripts/word-count.mjs";

const { pageById } = await import("../src/help/content.js");
const TARGETING = ["evidence-overlay", "undrilled-zones", "planned-drillholes", "voxel-ranges"];
// TASKS.csv #3962 (P2): the Drill program card joined the group later, with its own test (drillPlannerP2_3962)
const cautions = (id) => pageById(id).cautions.join(" | ").toLowerCase();

test("the four Targeting pages are cards: a picture from the existing kit, their cautions in view, their strips", () => {
  for (const id of TARGETING) {
    const p = pageById(id);
    assert.ok(p.line, `${id} is a card page`);
    assert.equal(p.area, "Targeting");
    for (const d of p.picture.drop || []) assert.ok(["holes", "map", "units", "plan", "section", "log", "table", "points", "plot", "grid", "terrain"].includes(d), `${id}: "${d}" is a DropDiagram picture`);
    assert.ok(p.strip.length >= 3, `${id}: a step strip (its walk-through is in view today)`);
  }
});

test("the protective cautions are in view (one hole / extrapolated / not a resource / design not prediction)", () => {
  assert.match(cautions("evidence-overlay"), /change a membership and the ranking changes/);
  assert.match(cautions("evidence-overlay"), /drillhole evidence alone ranks drilled ground, not new targets/);
  assert.match(cautions("undrilled-zones"), /untested ground, not a resource or a target ranking/);
  assert.match(cautions("undrilled-zones"), /distance is to the hole trace, not the samples/);
  assert.match(cautions("planned-drillholes"), /a planned hole is a design, not a prediction/);
  assert.match(cautions("planned-drillholes"), /blocks from one hole or extrapolated are not an intercept/); // PROTECTIVE: PlannedHoleParts
  assert.match(cautions("voxel-ranges"), /target outline, not a geological contact/);
});

test("'Use instead' chips point at pages that exist, and the plan's routes are there", () => {
  const to = (id) => (pageById(id).instead || []).map((x) => x.page);
  assert.deepEqual(to("undrilled-zones"), ["grade-shell", "grade-estimation"]);
  assert.deepEqual(to("planned-drillholes"), ["evidence-overlay", "undrilled-zones", "voxel-ranges"]);
  assert.deepEqual(to("voxel-ranges"), ["block-models", "evidence-overlay"]);
  assert.equal(pageById("evidence-overlay").instead, undefined);
});

test("words seen first: each page well under the old count, the whole group about 90 % less", async () => {
  const { countHelpPage } = await import("../scripts/word-count.mjs");
  const first = (p) => { let n = 0; countHelpPage(p, (_k, text, more) => { if (!more) n += wordsOf(text); }); return n; };
  const before = { "evidence-overlay": 785, "undrilled-zones": 542, "planned-drillholes": 734, "voxel-ranges": 457 }; // #3967's plan, the counts before
  let was = 0, now = 0;
  for (const id of TARGETING) { const n = first(pageById(id)); assert.ok(n < 110, `${id}: ${n} words seen first`); was += before[id]; now += n; }
  assert.ok(now < was * 0.15, `${now} of ${was}`);
});
