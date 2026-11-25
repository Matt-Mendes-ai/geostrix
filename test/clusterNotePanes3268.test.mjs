// TASKS.csv #3268 (review #3195, Galore Creek) — 'the holes lie in 9 clusters ... Model one cluster at a time' was only in Model settings,
// which the Simple ribbon hides; the Implicit surface and Strat. stack panes said nothing before Run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

test("#3268 the cluster note heads Model settings, Implicit surface and Strat. stack", () => {
  const src = modellingPanesSource().replace(/\r\n/g, "\n"); // CRLF checkout
  assert.match(src, /const clusterBody = \(\) => \(areaClusters && areaClusters\.clusters\.length > 1 \? \(<div role="note"/);
  assert.match(src, /const clusterNote = \(compact = false\) => \{/); // #4070 — the step panes take it as one line
  assert.equal((src.match(/\{clusterNote\((true)?\)/g) || []).length, 3);
  // TASKS.csv #4070 — the implicit surface as a step pane too: the note heads its StepPane, one line
  assert.match(src, /<StepPane id="implicit" label=\{tr\("Implicit surface"\)\}\n\s+top=\{<>\{clusterNote\(true\)/);
  // TASKS.csv #4070 — the stack as steps: the note heads the StepPane, above its step bar
  assert.match(src, /<StepPane id="stack" label=\{tr\("Stratigraphic stack"\)\}\n\s+top=\{<>\{clusterNote\(true\)/);
  const settings = src.slice(src.indexOf('toolPane === "settings"'), src.indexOf('toolPane === "settings"') + 8000);
  assert.ok(settings.includes("{clusterNote("), "still in Model settings"); // one line there since #4070 (clusterNote(true))
  assert.match(src, /Model one cluster at a time:/);
});
