// TASKS.csv #4039 (Matt, 2026-11-23, v0.2.9, WA lode gold: "for the sample datasets with lithology, I want them to open displaying lithology only and the
// other layers turned off by default"). The rule: a bundled sample whose own tables include a lithology log opens with Lithology shown and every other
// drillhole layer (and the custom layers it makes) loaded but hidden; a sample without lithology keeps today's choice; the user's own imports are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sampleLithOnly, hasLithology } from "../src/lib/sampleLithOnly.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const impl = read("../src/modules/viewer/importPipelineImpl.js");

test("what 'has lithology' means: the sample's own tables include litho.csv", () => {
  assert.equal(hasLithology(["collars.csv", "survey.csv", "litho.csv"]), true);
  assert.equal(hasLithology(["collars.csv", "LITHO.CSV"]), true);
  assert.equal(hasLithology(["collars.csv", "survey.csv", "sg.csv"]), false);
  assert.equal(hasLithology([]), false);
  assert.equal(hasLithology(null), false);
});

test("while a lithology-led sample loads only Lithology may be switched on; before and after, every layer may (the user's own imports)", () => {
  sampleLithOnly.reset();
  for (const k of ["litho", "alt", "vein", "structure", "custom", "weath", "mnlgy"]) assert.equal(sampleLithOnly.shows(k), true, `an ordinary import shows ${k}`);
  sampleLithOnly.begin();
  assert.equal(sampleLithOnly.shows("litho"), true);
  for (const k of ["alt", "vein", "breccia", "weath", "structzone", "geotech", "recovery", "sg", "mnlgy", "magsusc", "structure", "custom"]) assert.equal(sampleLithOnly.shows(k), false, `${k} loads hidden`);
  sampleLithOnly.end(); // the queue is empty
  for (const k of ["litho", "alt", "structure", "custom"]) assert.equal(sampleLithOnly.shows(k), true, `the user's own import of ${k} shows it again`);
  sampleLithOnly.reset();
});

test("a custom layer a sample's extras add is named hidden once, then read back once", () => {
  sampleLithOnly.reset();
  sampleLithOnly.begin(); assert.equal(sampleLithOnly.led(), true);
  sampleLithOnly.hideCustom("custom_1");
  sampleLithOnly.end(); assert.equal(sampleLithOnly.led(), true, "the extras may still be adding layers after the queue ended");
  assert.equal(sampleLithOnly.takeHiddenCustom("custom_1"), true);
  assert.equal(sampleLithOnly.takeHiddenCustom("custom_1"), false, "once: a later rebuild of that layer is the user's choice");
  assert.equal(sampleLithOnly.takeHiddenCustom("custom_2"), false, "any other custom layer starts shown, as before");
  sampleLithOnly.finish(); assert.equal(sampleLithOnly.led(), false);
  sampleLithOnly.reset();
});

test("every bundled sample table with a litho.csv is lithology-led, and the ones without keep their choice", () => {
  const table = impl.slice(impl.indexOf("const SAMPLES = {"), impl.indexOf("const loadSampleProject"));
  const entries = [...table.matchAll(/^ {4}([a-z_]+): \{[\s\S]*?files: \[([^\]]*)\]/gm)].map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]);
  const by = Object.fromEntries(entries);
  for (const id of ["harry", "woodjam", "silvertip", "wa_uranium", "wa_iron", "wa_lead_zinc", "wa_zinc_copper", "wa_gold", "qld_century"]) assert.equal(hasLithology(by[id]), true, id);
  for (const id of ["yk_macpass", "geomet", "qc_rouyn_noranda"]) assert.equal(hasLithology(by[id]), false, id);
});

test("the pipeline asks the rule at commit time, not inside a state updater (which runs after the queue has ended)", () => {
  assert.match(impl, /if \(hasLithology\(files\.map\(\(f\) => f\.name\)\)\) sampleLithOnly\.begin\(\);/);
  assert.match(impl, /if \(!file\) sampleLithOnly\.end\(\);/);
  assert.match(impl, /\{ const show = sampleLithOnly\.shows\(target\); setLayerVisible\(\(p\) => \(\{ \.\.\.p, \[target\]: show \}\)\); \}/);
  assert.match(impl, /\{ const show = sampleLithOnly\.shows\("structure"\); setLayerVisible\(\(p\) => \(\{ \.\.\.p, structure: show \}\)\); \}/);
  assert.match(impl, /\{ const show = sampleLithOnly\.shows\("custom"\); setCustomVisible\(\(p\) => \(\{ \.\.\.p, \[id\]: show \}\)\); \}/);
  assert.equal((impl.match(/const showCustom = sampleLithOnly\.shows\("custom"\);/g) || []).length, 2, "the per-mineral and the downhole-log layers");
  assert.ok(!/\(p\) => \(\{[^}]*sampleLithOnly\.shows/.test(impl), "no updater function calls shows()");
  assert.match(impl, /sampleLithOnly\.end\(\); \/\/ #4039\r?\n/); // an error in the load ends it too
});

test("the viewer starts a lithology-led sample's own custom layers hidden, and ends the rule when the loader is done", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /!sampleLithOnly\.takeHiddenCustom\(l\.id\)/);
  assert.equal((v.match(/if \(sampleLithOnly\.led\(\)\) sampleLithOnly\.hideCustom\(l\.id\);/g) || []).length, 3, "the WA extras, WA uranium's gamma log and the GSQ samples' borehole EM layers (#4105)");
  assert.match(v, /loadSample\(req\.which\)\.finally\(\(\) => sampleLithOnly\.finish\(\)\);/);
});
