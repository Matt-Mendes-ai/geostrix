// TASKS.csv #2352 (review #2325, WA uranium) — Jensen / Winchester name volcanic rocks only: the cover and palaeochannel codes are
// sedimentary, and on a logged project the user ticks which logged codes are volcanic before a layer is written
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSedimentaryCode, guessProtolith } from "../src/lib/geochemDiagrams.js";

test("the WA uranium log's codes are sedimentary; volcanic names still guess a volcanic protolith", () => {
  for (const c of ["LIG", "CLY", "CLS", "CBC", "SAN", "LIC", "SLT", "STS", "CON", "CAL", "lignite", "Clay", "calcrete", "mud", "SST"]) {
    assert.ok(isSedimentaryCode(c), c);
    assert.equal(guessProtolith(c), null, c); // never a starting tick in the volcanic-codes dialog
  }
  for (const [c, p] of [["BAS", "basalt"], ["Andesite", "andesite"], ["DAC", "dacite"], ["RHY", "rhyolite"]]) {
    assert.ok(!isSedimentaryCode(c), c);
    assert.equal(guessProtolith(c), p, c);
  }
});

test("Jensen / Winchester ask which logged codes are volcanic, then classify only those and say what was left", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(method\.volcanicOnly && !volcanic && \(layers\.litho \|\| \[\]\)\.length\) \{/);
  assert.match(g, /volcanic: !!code && !isSedimentaryCode\(code\) && !!guessProtolith\(code\)/);
  assert.match(g, /if \(method\.volcanicOnly && method\.requires\.every\(\(el\) => a\.values\?\.\[el\] != null\)\)/); // only samples the classifier could name
  assert.match(g, /volcanic \? !volcanic\.has\(code \?\? NOT_LOGGED_CODE\) : isSedimentaryCode\(code\)/);
  assert.match(g, /their logged codes were not ticked as volcanic \(\{codes\}\)/);
  assert.match(g, /onRun=\{\(set\) => \{ const k = volcModal\.methodKey; setVolcModal\(null\); runMethod\(k, null, set\); \}\}/);
  const m = readFileSync(new URL("../src/components/VolcanicCodesModal.jsx", import.meta.url), "utf8");
  assert.match(m, /useState\(\(\) => new Set\(codes\.filter\(\(c\) => c\.volcanic\)\.map\(\(c\) => c\.code\)\)\)/);
  assert.match(m, /disabled=\{!n\}/); // nothing ticked: nothing to classify
});
