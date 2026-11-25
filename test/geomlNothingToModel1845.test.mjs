// TASKS.csv #1845 (review #1754, Kodiak) — geoML invited a 554 MB / 1,760 MB install on a project it could not model (no collar with
// lithology or assays placed). It now says so above the offer, and the install is no longer the primary button there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/PredictivePanel.jsx", import.meta.url), "utf8");

test("the holes geoML could model: a collar placed and a log or assays", () => {
  assert.match(src, /const modelableHoles = useMemo\(\(\) => \{ const withData = new Set\(\[\.\.\.\(allLitho \|\| \[\]\), \.\.\.\(allAssays \|\| \[\]\)\]\.map\(\(r\) => r\.hole_id\)\); return \(allCollars \|\| \[\]\)\.filter\(\(c\) => withData\.has\(c\.hole_id\) && Number\.isFinite\(Number\(c\.x\)\) && Number\.isFinite\(Number\(c\.y\)\)\)\.length; \}/);
});

test("with none, a note before the offer and a secondary install button", () => {
  assert.match(src, /\{modelableHoles === 0 && <div role="note"[^>]*>\{tr\("Load drillholes first: geoML needs a hole with a collar and a lithology log or assays; this project has none\./);
  // the gold primary only with holes to model (#4069's roles, #4070)
  assert.match(src, /className=\{`gs-btn gs-btn--block\$\{modelableHoles > 0 \? " gs-btn--primary" : ""\}`\} \/\* gs-primary-alt: [^*]*#1845: not the primary action with nothing to model \*\//);
});
