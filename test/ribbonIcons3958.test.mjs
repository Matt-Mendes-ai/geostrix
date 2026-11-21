// TASKS.csv #3958 (Matt approved the "middle ground" mock) — the ribbon's icons: 16 tools carry drawn, two-tone icons (the geology block only where it is the tool);
// every other ribbon icon is its line icon drawn two-tone by RibbonButton. Colours: the family colour (currentColor) and tokens; no words in the SVG.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3958 the 16 tools use their drawn icons", () => {
  const vp = read("../src/modules/viewer/ViewerParts.jsx"), maps = read("../src/modules/MapsModule.jsx"), gc = read("../src/modules/GeochemModule.jsx");
  for (const [label, icon] of [["Add data", "AddDataIcon"], ["3D slice", "Slice3dIcon"], ["Fence series", "FenceIcon"], ["Level plan", "LevelPlanIcon"], ["Identify", "IdentifyIcon"], ["Best intercepts", "BestInterceptsIcon"], ["Geology map", "GeologyIcon"]]) {
    assert.match(vp, new RegExp(`icon=\\{${icon}\\} label="${label}"`), label);
  }
  for (const [icon, tone] of [["ModelIcon", "model"], ["GridIcon", "view"], ["FigureIcon", "view"], ["ThemesIcon", "view"], ["DrawSectionIcon", "section"], ["IdentifyIcon", "analyse"], ["MeasureIcon", "analyse"], ["SnapshotIcon", "output"]]) {
    assert.ok(vp.includes(`<${icon} size={22} color={RIBBON_TONES.${tone}} />`), icon);
  }
  for (const [label, icon] of [["Satellite", "SatelliteIcon"], ["Terrain", "TerrainIcon"], ["Geology \\(Macrostrat\\)", "GeologyIcon"]]) assert.match(maps, new RegExp(`icon=\\{${icon}\\} label="${label}"`), label);
  assert.match(gc, /icon=\{BestInterceptsIcon\} label="Best intercepts"/);
});

test("#3958 every other ribbon icon is drawn two-tone; the drawn ones are not washed twice", () => {
  const r = read("../src/components/Ribbon.jsx"), icons = read("../src/components/ribbonIcons.jsx");
  assert.match(r, /aria-hidden="true" \{\.\.\.twoTone\(Icon\)\} \/>/);
  assert.match(icons, /export const twoTone = \(Icon\) => \(Icon && !Icon\.drawn \? \{ fill: "currentColor", fillOpacity: 0\.16 \} : \{\}\);/);
  const drawn = [...icons.matchAll(/(\w+Icon) = icon\(/g)].map((m) => m[1]);
  assert.equal(drawn.length, 16, drawn.join(", "));
  assert.match(icons, /C\.drawn = true;/, "every drawn icon is flagged");
  // the 3D View's own ribbon buttons that keep a line icon are two-tone too
  const vp = read("../src/modules/viewer/ViewerParts.jsx");
  for (const m of vp.matchAll(/<(\w+) size=\{22\} strokeWidth=\{1\.7\}[^/]*\/>/g)) assert.match(m[0], /fill="currentColor" fillOpacity=\{0\.16\}/, m[1]);
});

test("#3958 the drawn icons: currentColor and tokens only, no words", () => {
  const icons = read("../src/components/ribbonIcons.jsx");
  assert.doesNotMatch(icons, /["'`]#[0-9a-fA-F]{3,6}\b|rgba?\(/);
  assert.doesNotMatch(icons, /<text\b/);
  assert.equal((icons.match(/linearGradient/g) || []).length, 2, "one token gradient (the block's), no per-icon gradient");
  assert.match(icons, /const id = `ri\$\{useId\(\)\.replace/, "the block's gradient id is unique per icon");
});
