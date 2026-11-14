// TASKS.csv #3264 (review #3195, Galore Creek) — the base of overburden was bent by 36 bedrock bedding / contact picks measured hundreds of
// metres below it (4.1 m off its contacts typically, 18.5 m at worst); the automatic reach kept every pick and did not say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("const gatherLithoSurfaceSpec = "), src.indexOf("const gatherLithoSurfaceSpec = ") + 60000);

test("#3264 an overburden unit takes no structure pick: its dip comes from its contacts, and the run says why", () => {
  assert.match(body, /const isOverburdenUnit = unitRoleOf\(target\) === "overburden";/);
  assert.match(body, /const ovbSkipped = isOverburdenUnit \? structRows\.length : 0;\s*if \(ovbSkipped\) structRows = \[\];/);
  // the skip is before the picks become orientations, so the estimate from the contact points takes over
  assert.ok(body.indexOf("if (ovbSkipped) structRows = [];") < body.indexOf("let orientations = structureRowsToOrientations(structRows, traces);"));
  assert.match(body, /if \(!silent && ovbSkipped\) setNotices\(\(p\) => \[\.\.\.p, notice\("Base of \{unitName\}: the \{n\} bedrock structure pick\(s\) were not used/);
});

test("#3264 an automatic reach that keeps every pick says so", () => {
  assert.match(body, /nearPicks\.kept\.length === nearPicks\.total && !\(orientationReachM > 0\)/);
  assert.match(body, /The automatic reach \(\{reachM\} m, twice the median collar spacing\) kept every pick/);
});
