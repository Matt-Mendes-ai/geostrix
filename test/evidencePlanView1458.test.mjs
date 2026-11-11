// TASKS.csv #1458 (review #1352, Silvertip) — the Evidence overlay says it is a plan view: the pane title, an intro line, the
// elevation range the drillhole evidence comes from, the block model's column range, and the rasters' names
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the pane and its rasters say plan view, and the depth the evidence came from", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /<TaskPaneHeader title=\{tr\("Evidence overlay"\)\} helpId="evidence-overlay"/); // the title stays the help page's; the intro line says plan view
  assert.match(p, /Plan view: every evidence is one value per map cell\./);
  assert.match(p, /The drillhole evidence here comes from holes between \{top\} and \{bottom\} m RL\./);
  assert.match(p, /const drillZ = useMemo\(\(\) => \{ let a = Infinity, b = -Infinity; for \(const t of traces\.values\(\)\)/);
  assert.match(p, /const DRILL_KINDS = new Set\(\["grade", "pxrf", "pick", "numeric", "zone"\]\);/);
  assert.match(p, /Whole column: every depth of the model \(\{z0\}–\{z1\} m RL\) counts, projected to the map\./);
  assert.match(p, /tr\("Plan-view weights-of-evidence posterior \(\{n\} occurrence cells\)"/);
  assert.match(p, /"Plan-view fuzzy overlay \(\{op\}\) of \{n\} evidence layers"/); // a singular / plural pair since #1731
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["Plan-view fuzzy overlay ({op}) of {n} evidence layers"] && d["Plan-view weights-of-evidence posterior ({n} occurrence cells)"], lang);
  }
});
