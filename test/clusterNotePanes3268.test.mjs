// TASKS.csv #3268 (review #3195, Galore Creek) — 'the holes lie in 9 clusters ... Model one cluster at a time' was only in Model settings,
// which the Simple ribbon hides; the Implicit surface and Strat. stack panes said nothing before Run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#3268 the cluster note heads Model settings, Implicit surface and Strat. stack", () => {
  const src = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const clusterNote = \(\) => \(areaClusters && areaClusters\.clusters\.length > 1 \? \(<div role="note"/);
  assert.equal((src.match(/\{clusterNote\(\)/g) || []).length, 3);
  for (const h of ['paneHeader("Implicit surface", Mountain, "model")}\n        {clusterNote()', 'paneHeader("Stratigraphic stack", Layers, "model")}\n        {clusterNote()']) assert.ok(src.includes(h), h);
  const settings = src.slice(src.indexOf('toolPane === "settings"'), src.indexOf('toolPane === "settings"') + 8000);
  assert.ok(settings.includes("{clusterNote()"), "still in Model settings");
  assert.match(src, /Model one cluster at a time:/);
});
