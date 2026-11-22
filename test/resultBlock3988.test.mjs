// TASKS.csv #3988 (Matt, 2026-11-21: "the add as block model menu and build blocks should be close to each other. Perhaps have them pinned at the top of the side panel.") —
// the 3D Modelling side panel's Result block: the last model's line, Build the blocks (its settings folded under it, the block count in one line) and the three Add buttons,
// pinned at the top while the panel scrolls under it. No behaviour change: the same buttons, the same build panel, every setting still there.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3988 the Result block is pinned at the top and holds the last-model line, the build panel and the three Add buttons in order", () => {
  const b = read("components/ModelResultBlock.jsx");
  assert.match(b, /position: "sticky", top: 0, zIndex: 4/);
  const iLine = b.indexOf("<b>{tr(\"Result\")}</b>"), iBuild = b.indexOf("{buildPanel}"), iUnit = b.indexOf("onUnitVolumes, Box"), iBlock = b.indexOf("onBlockModel, Box"), iLayer = b.indexOf("onModelledLayer, Layers3");
  assert.ok(iLine > 0 && iBuild > iLine && iUnit > iBuild && iBlock > iUnit && iLayer > iBlock, "the line, then Build the blocks, then the three Add buttons in the order a user takes them");
  assert.match(b, /window\.innerHeight >= 700/, "a short panel starts folded to one line");
  assert.match(b, /aria-expanded=\{open\}/);
  // before a model exists the Add buttons are disabled and say why
  assert.match(b, /const why = !last \? tr\("Build the blocks first\."\) : null;/);
  assert.match(b, /disabled=\{!can && !!why\} title=\{why \|\| title\}/);
  // a structural model has no litho block to add (#1554): no Add buttons, as before
  assert.match(b, /last\?\.structural \? null : \(<>/);
});

test("#3988 ViewerModule: the old Last model card and the in-place build panel are gone; the block is shown once a model exists, or while the build panel is open", () => {
  const v = read("modules/ViewerModule.jsx");
  assert.doesNotMatch(v, /margin: "8px 0 4px", padding: "8px 10px"[^\n]*\n\s*<div style=\{\{ color: "var\(--color-text\)", marginBottom: 6, opacity: isStaleStamp/, "the old card");
  assert.equal((v.match(/<SurfaceSolidsPanel/g) || []).length, 1, "the build panel is mounted once, in the block");
  assert.match(v, /\{\(lastLithBlock \|\| surfaceSolidsOpen\) && \(/);
  assert.match(v, /<ModelResultBlock last=\{lastLithBlock\}/);
  assert.match(v, /buildPanel=\{implicitSurfaces\.length \? <Suspense fallback=\{null\}><SurfaceSolidsPanel inline /);
  for (const [prop, fn] of [["onUnitVolumes", "addUnitVolumes"], ["onBlockModel", "addLithBlockModel"], ["onModelledLayer", "addModelledLayer"]]) assert.ok(v.includes(`${prop}={${fn}}`), fn);
});

test("#3988 the build panel's inline form: Build the blocks and the count in one row, every setting folded under it, the full form unchanged", () => {
  const p = read("components/SurfaceSolidsPanel.jsx");
  assert.match(p, /numInput, inline = false \}\) \{/);
  assert.match(p, /\{inline && <div style=\{\{ display: "flex", alignItems: "center", gap: 8 \}\}>\{buildBtn\}\{auto && countLine\}<\/div>\}/);
  assert.match(p, /<details style=\{\{ marginTop: 6 \}\}>[^\n]*tr\("Surfaces and block settings"\)/);
  assert.match(p, /whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"/, "the count and its note: one line (the full text is its tooltip)");
  assert.match(p, /\{!inline && <>\{auto && countLine\}\{buildBtn\}<\/>\}/, "the full form: the count, then the button, as before");
  // every setting is still there
  for (const s of ["Block size (m)", "Block height (m)", "Base (m)", "Extend contacts until they meet", "Cut at the terrain (nothing above the ground)", "Build the blocks"]) assert.ok(p.includes(s), s);
  assert.match(p, /\{!inline && \(<>\n/, "the title, close and intro only in the full form");
});

test("#3988 the new words are in es / pt / fr / ar", () => {
  for (const l of ["es", "pt", "fr", "ar"]) {
    const o = JSON.parse(read(`locales/${l}.json`));
    for (const k of ["Result", "No model yet.", "Build the blocks first.", "Surfaces and block settings", "Fold the result block", "Open the result block"]) assert.ok(o[k], `${l}: ${k}`);
  }
});
