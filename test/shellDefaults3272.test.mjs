// TASKS.csv #3272 (Galore Creek review) — the Grade shell opened on a porphyry at a 1 ppm Cu cutoff, with a cap from all 46 assayed holes though it
// ran on the 14 checked ones (P99 22,900 / CV 209 % against 25,600 / 154 %), and a fixed 50 m search that left 1,505 of 1,720 ore-grade composites
// outside the shell. The cutoff, the cap and the search now come from the holes the run uses, proposed once for the opening element.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { restrictRowsToHoles } from "../src/lib/modelArea.js";
import { cutoffPct } from "../src/lib/gradeTonnage.js";
import { searchFromSpacingM } from "../src/lib/holeSpacing.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the helpers the pane uses: the Model area's rows, a base metal's ppm in %, the search from the spacing", () => {
  const rows = [{ hole_id: "A", v: 1 }, { hole_id: "B", v: 2 }, { hole_id: null, v: 3 }];
  assert.deepEqual(restrictRowsToHoles(rows, { B: false }).map((r) => r.v), [1, 3]);
  assert.equal(cutoffPct(1000, "Cu", "ppm"), 0.1);
  assert.equal(cutoffPct(1, "Au", "ppm"), null);
  assert.ok(searchFromSpacingM(200) >= 400); // 2.5 x the typical spacing, as Estimation's
});

test("wiring: the opening cutoff, the cap and the search from the holes the run uses; the % hint; the notes", () => {
  const m = modellingPanesSource();
  assert.match(m, /const shellAreaAssays = useMemo\(\(\) => \(modelArea === "checked" \? restrictRowsToHoles\(assays \|\| \[\], visibleHoles\) : assays \|\| \[\]\)/);
  assert.match(m, /if \(numericCutoff === 1 && shellCutoffAuto\?\.value !== 1\) proposeShellCutoff\(numericSymbol, true\);/); // #3651: the memory outlives a project load
  // #3580 — or a search it set from the collars that nobody changed, once the samples' spacing is known; from the samples first
  assert.match(m, /if \(shellSearchAuto && !shellSearchTyped\.current && \(\(numericSearchRadius === 50 && shellSearchSet\?\.r !== 50\) \|\| untouchedCollarSearch \|\| untouchedOtherArea\)\) \{ setNumericSearchRadius\(shellSearchAuto\);/); // #3607 (3): never a typed search; #3651: another area's untouched search
  assert.match(m, /const shellSearchFrom = shellSampleSpacing\?\.medianM > 0 \? \{ m: Math\.round\(shellSampleSpacing\.medianM\), at: "samples" \} : shellSpacing\?\.medianM > 0 \? /);
  assert.match(m, /proposeShellCutoff\(next\); \/\/ #3272/);
  assert.equal((m.match(/(?:const|let) p90 = /g) || []).length, 1, "one proposal, for the element change and the opening");
  assert.match(m, /<ShellCapNote assays=\{shellAreaAssays/);
  assert.match(m, /cutoffPct\(numericCutoff, sym, unit\) != null && <div/);
  assert.match(m, /shellSearchSet && numericSearchRadius === shellSearchSet\.r && <div[^>]*>\{shellSearchSet\.at === "samples" \? tr\("Search radius \{r\} m: 2\.5 times the \{m\} m typical distance from a sample to the nearest sample of another hole[^"]*", shellSearchSet\) : tr\("Search radius \{r\} m: 2\.5 times the \{m\} m typical spacing/);
  const c = src("modules/viewer/ShellCapNote.jsx");
  assert.match(c, /\}, \[symbol, cv, src, cutoff\]\);/); // the cut-off: #3781
  const rule = src("lib/viewer/shellCapRule.js"); // #3650 — the decision, asked by the note
  assert.match(c, /shellCapAction\(\{ symbol, auto: auto\.current, capValue/);
  assert.match(rule, /if \(has && !mine && !stale\) return "keep"; \/\/ a typed cap/);
  assert.match(rule, /if \(own && !has\) return "keep";/);
  // the cap the note set is kept by the pane: the note unmounts with the pane, and a reopened pane treated its own cap as typed (found live)
  assert.match(c, /const auto = autoRef \|\| ownRef;/);
  assert.match(m, /autoRef=\{shellCapAuto \/\* #3272 \*\/\}/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Cutoff {v}: the 90th percentile of the {n} {symbol} values in the holes the shell uses, proposed for the element it opened on. Type your own.", "{v} ppm {symbol} is {p} %.",
      "Search radius {r} m: 2.5 times the {m} m typical spacing, so a block between two holes reaches both."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
