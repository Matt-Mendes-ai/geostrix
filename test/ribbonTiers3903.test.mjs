// TASKS.csv #3903 / #3914 / #3906 (the #3901 redesign, batch P3) — the tool tiers inside the tabs. An advanced tool carries a thin blue
// bar on its ribbon button and Basic tools hides it as before; a basic tool carries no mark.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

test("#3903 an advanced tool's ribbon button carries the blue bar; Basic tools still hides it", () => {
  const css = rd("src/styles/app.css");
  assert.match(css, /--tier-tool-bar: 0\.25em;/);
  assert.match(css, /\.ge-adv \.ge-ribbon-btn \{ box-shadow: inset 0 var\(--tier-tool-bar\) 0 var\(--color-tier-advanced\); \}/);
  assert.match(css, /\.ge-adv \.ge-ribbon-btn\.active \{ box-shadow: inset 0 var\(--tier-tool-bar\) 0 var\(--color-tier-advanced\), inset 0 -2px 0 var\(--color-accent-dark\); \}/);
  assert.match(css, /\.ge-ribbon-group\.ge-adv > \.ge-ribbon-caption \{ color: var\(--color-tier-advanced\); \}/);
  assert.match(css, /\.ge-ribbon-simple \.ge-adv \{ display: none; \}/);
  const rib = rd("src/components/Ribbon.jsx");
  assert.match(rib, /<div className=\{`ge-ribbon-cell\$\{advanced \? " ge-adv" : ""\}`\}>/);
  assert.match(rib, /<div className=\{`ge-ribbon-group\$\{advanced \? " ge-adv" : ""\}`\}/);
});

test("#3914 the StrixViewer ribbon: Add data (the drop import), Interpret and Boundary intercepts Advanced, the figure overlay in the view's corner", () => {
  const vp = rd("src/modules/viewer/ViewerParts.jsx");
  assert.match(vp, /requestModuleAction\("import-dropped-files", \{ files \}\)/); // the same import as a drop on the view, no new path
  assert.match(vp, /<RibbonButton icon=\{Upload\} label="Add data" tone="data"/);
  assert.match(vp, /<div className="ge-ribbon-cell ge-adv">\{\/\* TASKS\.csv #1152; Advanced since #3914/);
  assert.match(vp, /<div className="ge-ribbon-cell ge-adv">\{\/\* TASKS\.csv #3914 — a specialist report: Advanced \*\/\}\n\s+<HoverToolInfo title=\{tr\("Boundary intercepts"\)\}/);
  assert.match(vp, /<RibbonButton advanced=\{noHoles\} icon=\{FileBarChart2\} label="Best intercepts"/); // Basic once there are holes (#2778 hides it with none)
  assert.match(rd("src/modules/viewer/useImportPipeline.js"), /useModuleAction\(\["import-dropped-files"\]/);
  const ve = rd("src/modules/viewer/ViewVeSelect.jsx");
  assert.match(ve, /onClick=\{\(\) => setFigureOverlay\(\(f\) => \(\{ \.\.\.f, enabled: !f\.enabled \}\)\)\}/);
});

test("#3906 with Basic tools an empty sidebar section waits for All tools; the Browser panel is closed by default", () => {
  const vm = rd("src/modules/ViewerModule.jsx");
  assert.match(vm, /const basicTools = useUiMode\(\)\.mode === "simple";/);
  for (const list of ["customLayers", "mapLayers", "sectionImages", "domains"]) assert.ok(vm.includes(`{(!basicTools || ${list}.length > 0) && (<>`), list);
  assert.match(vm, /<BrowserDock onImportFile=\{importBrowserFile\} onImportRows=\{openImportFromRows\}/);
  assert.doesNotMatch(vm, /<DbBrowserPanel/);
  const dock = rd("src/modules/viewer/BrowserDock.jsx");
  assert.match(dock, /const readOpen = \(\) => \{ try \{ return localStorage\.getItem\(OPEN_KEY\) === "1"; \} catch \(_\) \{ return false; \} \};/); // closed unless opened before
  assert.match(dock, /\{open && \(<>/);
  assert.match(dock, /const DbBrowserPanel = React\.lazy\(/);
});
