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

// The tools a ribbon shows with Basic tools, read from its JSX: a group or tool marked advanced is left out; `noHoles` is false (a project
// with drillholes, where the most show). A tool shown only under a condition counts, as the worst case.
function basicTools(src, start) {
  const a = src.indexOf(start), b = src.indexOf("</Ribbon>", a);
  assert.ok(a >= 0 && b > a, start);
  const adv = (attrs) => { const m = attrs.match(/\badvanced(?:=\{([^}]*)\})?/); return !!m && m[1] !== "noHoles"; }; // bare, or {!noHoles} with holes
  const out = [];
  for (const g of src.slice(a, b).matchAll(/<RibbonGroup([^>]*)>([\s\S]*?)<\/RibbonGroup>/g)) {
    if (adv(g[1])) continue;
    for (const t of g[2].matchAll(/<RibbonButton\b([\s\S]*?)\/>|<div className=(\{`ge-ribbon-cell\$\{noHoles \? " ge-adv" : ""\}`\}|"ge-ribbon-cell(?: ge-adv)?")>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<HoverToolInfo title=\{tr\("([^"]+)"\)\}/g)) {
      if (t[1] !== undefined) { if (!adv(t[1])) out.push(t[1].match(/label=(?:"([^"]+)"|\{tr\("([^"]+)")/)?.slice(1).find(Boolean)); }
      else if (!t[2].includes('"ge-ribbon-cell ge-adv"')) out.push(t[3]);
    }
  }
  return out;
}

test("the Basic-tools budget: the StrixViewer ribbon shows nine tools or fewer (a new tool is Advanced unless added to this list on purpose)", () => {
  const list = basicTools(rd("src/modules/viewer/ViewerParts.jsx"), '<Ribbon show={show} label="StrixViewer tools">');
  assert.deepEqual(list, ["Add data", "Draw cross-section", "Identify", "Measure", "Data table", "Run data QC", "Best intercepts", "Snapshot to Layout", "Export drillholes"]);
  assert.ok(list.length <= 9);
});

test("the Basic-tools budget: the Layout ribbon shows nine tools or fewer (#3912: the sheets, one Add button)", () => {
  const list = basicTools(rd("src/modules/LayoutModule.jsx"), '<Ribbon label="Layout tools">');
  assert.ok(list.length <= 9, `${list.length}: ${list.join(", ")}`);
});

test("#3907 the Geological Mapping ribbon's Basic-tools short list: Geology map, Outcrop structures, Identify, Rock chips", () => {
  assert.deepEqual(basicTools(rd("src/modules/viewer/ViewerParts.jsx"), '<Ribbon show={show} label="Geological Mapping tools">'), ["Geology map", "Outcrop structures", "Identify", "Rock chips"]);
});
