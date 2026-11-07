// TASKS.csv #1370 (review #1352, Silvertip) — a stack whose youngest unit has no tops of its own (Earn under overburden in every
// hole), or whose overburden's base is folded into the unit under it, still models the one contact left instead of
// "Need at least 2 units"; the youngest unit is not listed as "skipped" as if something were wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const body = runs.slice(runs.indexOf("const runStackModel = async"), runs.indexOf("const runMapModel = async"));

test("the youngest unit is the first that is not overburden, and its skip is said apart", () => {
  assert.match(body, /const youngestAt = unitNames\.findIndex\(\(_, i\) => i !== ovbAt\)/);
  assert.match(body, /const otherSkipped = youngestSkipped \? skipped\.slice\(1\) : skipped/);
  assert.match(body, /As the youngest unit of the stack it needs none/);
});

test("one contact left is modelled when the youngest unit needs no top or overburden was folded in", () => {
  assert.match(body, /const oneContactOk = specs\.length === 1 && \(youngestSkipped \|\| ovbAt >= 0\)/);
  assert.match(body, /if \(specs\.length < 2 && !oneContactOk\) \{[^}]*Need at least 2 units/);
  // the solve below still runs with whatever specs there are (a stack of one is runSurfaceModel's own path)
  assert.match(body, /await runSurfaceStack\(\[\.\.\.faultSpecs, \.\.\.specs\]/);
  assert.match(runs, /const runSurfaceModel = \(spec, opts\) => runSurfaceStack\(\[spec\], opts\)/);
});

test("the button's help says so", () => {
  const help = readFileSync(new URL("../src/help/pages/modelling.js", import.meta.url), "utf8");
  assert.match(help, /that contact is solved on its own/);
  assert.match(help, /One contact to model: \{surface\}/);
});
