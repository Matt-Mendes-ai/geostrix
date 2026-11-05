// TASKS.csv #1543 / #1544 / #1547 — fault pick warnings before the solve; solid-block defaults; logged codes in the Explicit unit picker
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("#1543 the stack says its fault warnings before solving and asks once about random picks", () => {
  const m = read("../src/modules/viewer/modellingRuns.js");
  assert.match(m, /random: fs\?\.noPreferred \? \{ name, k: fs\.k \} : null/);
  const pre = m.indexOf("if (randomFaults.length && !window.confirm("), run = m.indexOf("await runSurfaceStack([...faultSpecs, ...specs]");
  assert.ok(pre > 0 && pre < run, "the question comes before the solve");
  assert.ok(m.lastIndexOf("if (faultWarnings.length) setNotices((p) => [...p, ...faultWarnings]);", run) > 0, "warnings pushed before the solve");
});

test("#1544 solid blocks: structures and older runs not used by default; units named after the unit", () => {
  const s = read("../src/components/SurfaceSolidsPanel.jsx");
  assert.match(s, /const notATop = \/\^structure:\/i\.test\(s\.name \|\| ""\)/);
  assert.match(s, /SOLID_SURFACE_TYPES\.has\(s\.type\) \|\| notATop\) \? "none" : "top"/);
  assert.match(s, /older \? \{ \.\.\.it, older, defaultRole: "none" \} : it/);
  assert.ok(s.includes("const unitName = String(s.name || \"\").replace(/^top of"), "a Top of X surface names the unit X");
});

test("#1547 the Explicit unit picker lists the logged lithology codes", () => {
  const e = read("../src/components/ExplicitSurfacePanel.jsx");
  assert.match(e, /loggedUnits = \[\] \/\* #1547 \*\//);
  assert.match(e, /<optgroup label=\{tr\("Logged codes"\)\}>/);
  assert.match(read("../src/modules/viewer/ModellingPanes.jsx"), /loggedUnits=\{litho_units\}/);
});

test("#1543 'Add a fault...' shows each candidate's k, loading the stereonet maths only with the stack pane", async () => {
  const p = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(p, /if \(toolPane !== "stack" \|\| !faultCandidates\.length\) return undefined;/);
  assert.match(p, /import\("\.\.\/\.\.\/lib\/stereonet\.js"\)\.then\(\(\{ fisherStats \}\)/);
  assert.match(p, /faultK\[c\.key\]\.random \? tr\(" · k \{k\}, no preferred orientation"/);
  assert.doesNotMatch(p, /^import [^\n]*lib\/stereonet\.js/m, "not a static import");
});
