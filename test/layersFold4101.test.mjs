// TASKS.csv #4101 (side 3's audit: the 3D View Layers sidebar was 201 words / 160 controls / 3.1 screens on wa_uranium) — the hole labels, the collar size, the drawing
// style and the assay element picker are ONE fold, "More display options", after the layer rows. Folded, not hidden: the reachable set is pinned here — what is inside the
// fold, what stays outside (the Collars / Survey buttons, every layer row, the assays' eye / count / Clear / Bars), that the fold opens by itself while no element is
// chosen, and that open / closed is remembered per computer, never in the project.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const viewer = read("../src/modules/ViewerModule.jsx"), fold = read("../src/modules/viewer/ViewerParts.jsx");
const open = viewer.indexOf("<MoreDisplayFold "), close = viewer.indexOf("</MoreDisplayFold>");
const inside = viewer.slice(open, close), before = viewer.slice(0, open);

test("inside the fold: hole labels, the Collars tick, the collar size, the drawing style and the assay element picker", () => {
  assert.ok(open > 0 && close > open && viewer.split("<MoreDisplayFold ").length === 2, "one fold");
  for (const needle of ['aria-label={tr("Hole labels")}', "onChange={(e) => setHoleLabelMode(e.target.value)}", "collarsOff: !e.target.checked", "<CollarSizeControl", "<LightDrawingControl", 'placeholder={tr("Filter elements")}', "toggleAssayElement(e.symbol)", "setAssayStyleModalSymbol(e.symbol)"]) {
    assert.ok(inside.includes(needle), `inside the fold: ${needle}`);
    assert.equal(before.includes(needle) && needle !== "setAssayStyleModalSymbol(e.symbol)" && needle !== "toggleAssayElement(e.symbol)", false, `not also above the fold: ${needle}`);
  }
});

test("outside, above the fold and in view: the Collars and Survey buttons, the layer rows, the surface samples and the assays' eye, count, Clear and Bars", () => {
  for (const needle of ['tr("Collars {v}"', 'tr("Survey {v}"', "renderLayerRow", 'tr("Surface samples")', "<AssayBarsToggle", 'tr("Hide all assay elements")', 'tr("No elements selected")', "setAssayDisplayElements([])", 'tr("Clear")']) assert.ok(before.includes(needle), `above the fold: ${needle}`);
  assert.ok(!inside.includes("renderLayerRow") && !inside.includes("<AssayBarsToggle"), "no layer row and no Bars switch inside");
  // the layer rows come before the fold in the sidebar, and the fold is after the Assays section
  assert.ok(before.indexOf('tr("Layers")') > before.indexOf('tr("Collars {v}"'));
  assert.ok(before.lastIndexOf('tr("Assays")') > before.lastIndexOf('tr("Layers")'));
});

test("the chosen elements are named beside the count, so a closed fold still says which are on", () => {
  assert.match(before, /assayDisplayElements\.slice\(0, 6\)\.join\(", "\)/);
});

test("the fold renders only where something is in it, and opens by itself while no element is chosen", () => {
  assert.match(viewer, /\{\(collars\.length > 0 \|\| assayElements\.length > 0\) && \(\s*<MoreDisplayFold key=\{assayElements\.length > 0 \? "assays" : "none"\} openFirst=\{assayElements\.length > 0 && assayDisplayElements\.length === 0\}>/);
});

test("MoreDisplayFold (in ViewerParts): a <details> named More display options; open state from the saved choice, else openFirst; saved per computer", () => {
  assert.match(fold, /<details data-more-fold="" data-more-display="" open=\{open\}/);
  assert.match(fold, /tr\("More display options"\)/);
  assert.match(fold, /useState\(\(\) => rememberedMoreDisplay\(\) \?\? !!openFirst\)/);
  assert.match(fold, /localStorage\.setItem\(MORE_DISPLAY_KEY/);
  const part = fold.slice(fold.indexOf("export function MoreDisplayFold"));
  assert.ok(!/store\.|setProject|saveProject/.test(part), "not in the project file");
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))["More display options"], `translated in ${lang}`);
});
