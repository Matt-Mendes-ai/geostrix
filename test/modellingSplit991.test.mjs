// TASKS.csv #991 — the ModellingPanes / modellingRuns split is held together by name lists: ViewerModule spreads an object
// into <ModellingPanes> and passes a ctx to useModelling, which hands it to createModellingRuns. A name a pane or a run
// destructures but ViewerModule stops passing is silently undefined (ESLint only sees the other direction), so this reads
// the three files and checks both directions.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = (f) => fs.readFileSync(new URL(`../src/modules/${f}`, import.meta.url), "utf8");
const vm = src("ViewerModule.jsx"), panes = src("viewer/ModellingPanes.jsx"), runs = src("viewer/modellingRuns.js"), hook = src("viewer/useModelling.js");
// the names of a destructuring / shorthand-object body: comments removed, "a, b: c, d" -> a, d (a renamed key counts as its key)
const names = (block) => new Set([...block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").matchAll(/([A-Za-z_$][\w$]*)\s*(?=[,}]|$)/gm)].map((m) => m[1]));
const grab = (text, re, what) => { const m = text.match(re); assert.ok(m, `could not find ${what} — update this test with the code`); return names(m[1]); };

test("#991 every prop ModellingPanes destructures is passed by ViewerModule, and nothing is passed that it does not read", () => {
  const wanted = grab(panes, /const \{([\s\S]*?)\} = props;/, "ModellingPanes' props destructure");
  const passed = grab(vm, /<ModellingPanes \{\.\.\.\{([\s\S]*?)\}\} \/>/, "the <ModellingPanes {...{ }} /> spread");
  assert.ok(wanted.size > 100, `${wanted.size} props found`);
  assert.deepEqual([...wanted].filter((n) => !passed.has(n)), [], "destructured by ModellingPanes but not passed");
  assert.deepEqual([...passed].filter((n) => !wanted.has(n)), [], "passed to ModellingPanes but never read");
});

test("#991 every ctx field the modelling runs and hook read is passed to useModelling, and nothing else", () => {
  const runNames = grab(runs, /export function createModellingRuns\(ctx, mcRef\) \{\s*const \{([\s\S]*?)\} = ctx;/, "createModellingRuns' ctx destructure");
  const hookNames = grab(hook, /export function useModelling\(ctx\) \{\s*const \{([\s\S]*?)\} = ctx;/, "useModelling's ctx destructure");
  const ctx = grab(vm, /useModelling\(\{([\s\S]*?)\}\);/, "the useModelling({ }) call");
  assert.ok(runNames.size > 50, `${runNames.size} ctx fields found`);
  assert.deepEqual([...runNames, ...hookNames].filter((n) => !ctx.has(n)), [], "read by the runs / hook but not passed");
  assert.deepEqual([...ctx].filter((n) => !runNames.has(n) && !hookNames.has(n)), [], "passed in the ctx but read by neither");
});
