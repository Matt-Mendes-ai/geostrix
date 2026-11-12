// TASKS.csv #2538 / #2539 (review #2486) — two modelling texts that misled:
// #2538 a Closed body run UNDER a structural trend said 'a geology trend can join them' (the sheets' trend made 23 bodies, none made 16);
// #2539 an Implicit run with no structure data estimated its own dip, then its pick check told the user to 'fix or exclude' it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const loc = (l) => JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));

test("#2538 — with a trend on, the separate-bodies notice does not offer a trend", () => {
  assert.match(r, /: notice\(anisotropy\.enabled \/\* TASKS\.csv #2538[^\n]*\n\s*\? "\\"\{label\}\\": threshold \{iso\} gives \{n\} separate bodies under the structural trend;/);
  assert.match(r, /: "\\"\{label\}\\": threshold \{iso\} gives \{n\} separate bodies; the largest has \{p\} % of the triangles\. A lower \\"Inside at\\" or a geology trend can join them/);
});

test("#2539 — the run's own estimate is tagged and worded apart", () => {
  assert.match(r, /let orientationEstimated = false;/);
  assert.match(r, /orientations = \[est\];\r?\n\s*orientationEstimated = true;/);
  assert.match(r, /\.\.\.\(orientationEstimated \? \{ orientationEstimated: true \} : \{\}\) \/\* #2539 \*\//);
  assert.match(r, /return r && \{ \.\.\.r, estimated: !!sp\.orientationEstimated \};/);
  assert.match(r, /const onlyEstimate = pickIssues\.every\(\(r\) => r\.estimated && !r\.duplicates && !r\.close && !r\.conflicts\);/);
  assert.match(r, /r\.orientations && r\.estimated \? tr\(" the dip estimated from the contacts themselves \(no structure pick was used\)/);
});

test("the new keys are in every locale", () => {
  const keys = [
    "Pick check before solving — {v} The run goes ahead as it is.",
    "\"{label}\": threshold {iso} gives {n} separate bodies under the structural trend; the largest has {p} % of the triangles. The trend's ratios shorten the search across its plane, which can split a body: compare a run without the trend. A lower \"Inside at\" can join them, but can also add small separate bodies around isolated holes (Modelling codes).",
  ];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = loc(l); for (const k of keys) assert.ok(d[k], `${l}: ${k.slice(0, 40)}`); }
});
