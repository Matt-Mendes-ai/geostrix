// TASKS.csv #3981 (batch C3 of #3967's plan) — the Geophysics Help pages as cards, on the pilots' pattern (src/help/CardPage.jsx). Point survey was a pilot (#3973).
// The generic limits (one line of at most 15 words, a picture, 2-4 key settings with gists, every sentence still found) are helpCards3973's, which loops over
// every card page; this file pins what is specific to these fourteen: the cautions in view, the routes, the pictures and the words seen first.
import test from "node:test";
import assert from "node:assert/strict";
import { wordsOf, countHelpPage } from "../scripts/word-count.mjs";

const { pageById, PAGES } = await import("../src/help/content.js");
const GEO = ["downhole-logs", "mt-soundings", "fdem-1d", "block-models", "mag-grav-inversion", "dcip", "terrain", "cell-budget", "omf", "magnetics", "gravity", "radiometrics", "em-surveys", "tem-lines"];
const cautions = (id) => (pageById(id).cautions || []).join(" | ").toLowerCase();

test("every Geophysics page is a card (with the pilot, Point survey), none with a strip: their walk-throughs were folded", () => {
  for (const id of [...GEO, "point-survey"]) { const p = pageById(id); assert.ok(p.line, `${id} is a card page`); assert.equal(p.area, "Geophysics"); }
  for (const id of GEO) { assert.equal(pageById(id).strip, undefined, `${id}: no strip`); assert.ok(pageById(id).howto.folded, `${id}: the walk-through is folded, so it stays behind More`); }
  assert.equal(PAGES.filter((p) => p.area === "Geophysics" && !p.line).length, 0);
});

test("the protective cautions are in view (1D depths, one model of many, depth of investigation, regional, no tonnage, canopy, the ground)", () => {
  assert.match(cautions("mt-soundings"), /1d: under a 3d body they are wrong/);
  assert.match(cautions("fdem-1d"), /wrong under a dyke, pipe or any 3d conductor/);
  assert.match(cautions("fdem-1d"), /below the depth of investigation the model is not data/);
  assert.match(cautions("block-models"), /one model of many that fit/);
  assert.match(cautions("mag-grav-inversion"), /one model of many that fit/);
  assert.match(cautions("mag-grav-inversion"), /remove the regional; never a derivative or rtp/);
  assert.match(cautions("mag-grav-inversion"), /no volume or tonnage comes from the model/);
  assert.match(cautions("dcip"), /one model of many that fit/);
  assert.match(cautions("dcip"), /extrapolated, not data/); // PROTECTIVE: DcipPanel
  assert.match(cautions("dcip"), /2\.5d: the ground is assumed not to change across the line/);
  assert.match(cautions("tem-lines"), /wrong under a 3d conductor/);
  assert.match(cautions("tem-lines"), /below the depth of investigation the model is a guess, not data/);
  assert.match(cautions("tem-lines"), /presets are approximate, not the system's real waveform/);
  assert.match(cautions("terrain"), /in forest it reads the canopy top/);
  assert.match(cautions("terrain"), /do not move the collars/);
  assert.match(cautions("em-surveys"), /1d model is wrong under a 3d conductor/);
  assert.match(cautions("gravity"), /observed gravity is not an anomaly yet/);
  assert.match(cautions("radiometrics"), /a surface signal, not a rock map/);
  assert.match(cautions("omf"), /omf v2 files are not read/);
  assert.match(pageById("point-survey").cautions[0], /not for resource estimation/);
});

test("pages with no warning of their own show their routes instead: Downhole logs, Cell budget, Magnetics", () => {
  for (const id of ["downhole-logs", "cell-budget", "magnetics"]) { assert.equal(pageById(id).cautions, undefined, id); assert.ok(pageById(id).instead.length >= 1, id); }
  assert.deepEqual(pageById("downhole-logs").instead.map((x) => x.page), ["grade-estimation"]);
});

test("'Use instead' chips: the plan's routes, each a link to a page that exists where it names one", () => {
  const to = (id) => (pageById(id).instead || []).map((x) => x.page);
  assert.deepEqual(to("block-models"), ["point-survey", "mag-grav-inversion", "omf"]);
  assert.deepEqual(to("mag-grav-inversion"), ["block-models", undefined]);
  assert.deepEqual(to("dcip"), ["block-models", undefined]);
  assert.deepEqual(to("em-surveys"), ["tem-lines", "fdem-1d", "mt-soundings"], "the chooser: three links");
  assert.deepEqual(to("omf"), ["block-models"]);
  assert.deepEqual(to("mt-soundings"), ["block-models"]);
  for (const id of GEO) for (const x of pageById(id).instead || []) if (x.page) assert.ok(pageById(x.page), `${id}: ${x.page}`);
});

test("pictures: the depth of investigation (N2) on the inversion pages, the kit elsewhere, the lands-here picture beside OMF's message", () => {
  for (const id of ["mt-soundings", "fdem-1d", "mag-grav-inversion", "dcip", "tem-lines"]) assert.equal(pageById(id).picture.help, "depth", id);
  assert.deepEqual(pageById("downhole-logs").picture.drop, ["log", "plot"]);
  assert.deepEqual(pageById("terrain").picture.drop, ["terrain"]);
  for (const id of ["magnetics", "gravity", "radiometrics"]) assert.deepEqual(pageById(id).picture.drop, ["points"], id);
  assert.equal(pageById("omf").figure.help, "lands");
  for (const id of GEO) assert.ok(pageById(id).picture.alt.length > 20, `${id}: an alt sentence`);
});

test("words seen first: each page well under the old count, the fourteen about 79 % less", () => {
  const first = (p) => { let n = 0; countHelpPage(p, (_k, text, more) => { if (!more) n += wordsOf(text); }); return n; };
  const before = { "downhole-logs": 153, "mt-soundings": 245, "fdem-1d": 325, "block-models": 393, "mag-grav-inversion": 621, dcip: 524, terrain: 493, "cell-budget": 210, omf: 309, magnetics: 88, gravity: 94, radiometrics: 97, "em-surveys": 98, "tem-lines": 333 }; // #3967's plan, the counts before
  let was = 0, now = 0;
  for (const id of GEO) { const n = first(pageById(id)); assert.ok(n < 110 && n < before[id] * 0.7, `${id}: ${n} words seen first (was ${before[id]})`); was += before[id]; now += n; }
  assert.ok(now < was * 0.3, `${now} of ${was}`);
});
