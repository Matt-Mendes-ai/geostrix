// TASKS.csv #3287 (Matt: "macrostrat geology deserves its own icon on the ribbon") — a 'Geology (Macrostrat)' button in the Maps ribbon's Map
// layers group (on the Simple ribbon too), opening the Web layers pane's 'Macrostrat geology…' dialog through the same steps; the item stays.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("the Maps ribbon: a strata icon in Map layers, not Advanced-only, asking the Web layers pane for the dialog", () => {
  const m = rd("modules/MapsModule.jsx");
  const group = m.slice(m.indexOf('<RibbonGroup label="Map layers">'), m.indexOf("</RibbonGroup>", m.indexOf('<RibbonGroup label="Map layers">')));
  assert.match(group, /<RibbonButton icon=\{Layers3\} label="Geology \(Macrostrat\)" tone="data" title="[^"]+" \{\.\.\.btn\("web", "open-macrostrat"\)\} active=\{false\} \/>/);
  assert.match(m, /import \{[^}]*\bLayers3\b[^}]*\} from "\.\.\/components\/icons\.js"/);
  assert.match(rd("components/icons.js"), /export const Layers3 = /);
});

test("the pane answers the action with the item's own steps; the item keeps them", () => {
  const g = rd("modules/GeophysicsModule.jsx");
  assert.match(g, /useModuleAction\(\["open-macrostrat"\], \(\) => \{ if \(forcePane === "web"\) openMacrostrat\(\); \}\);/);
  assert.match(g, /const openMacrostrat = async \(\) => \{\n[^\n]*ensureProjectCrs[^\n]*\n\s*setWebLayerDefaultBbox\(await defaultSrtmBboxLonLat\(\)\); setMacrostratOpen\(true\);/);
  assert.match(g, /<button onClick=\{openMacrostrat [^}]*\} style=\{pBtn\} title=\{tr\("Macrostrat's compilation of geologic maps/);
  assert.match(g, /\{tr\("Macrostrat geology…"\)\}<\/button>/);
});

test("the label and tooltip in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`locales/${lang}.json`));
    assert.ok(d["Geology (Macrostrat)"], lang);
    assert.ok(Object.keys(d).some((k) => k.startsWith("Macrostrat's compilation of geologic maps (CC BY 4.0) for the project area, as a drape")), lang);
  }
});
