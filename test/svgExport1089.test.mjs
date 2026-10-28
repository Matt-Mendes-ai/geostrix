// TASKS.csv #1089 (review #1016) — every SVG / PNG figure export goes through exportSvgMarkup (font named, explicit size,
// no UI chrome, white ground); the atlas strip log names the font too. (The function needs a DOM: checked live.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
test("#1089 no figure exporter serializes its <svg> raw any more", () => {
  for (const f of ["components/DownholeStructurePlot.jsx", "components/FenceDiagramModal.jsx", "components/StereonetModal.jsx", "components/StripLog.jsx", "modules/GeochemModule.jsx", "components/SectionWindow.jsx"]) {
    const s = src(f);
    assert.ok(!s.includes("new XMLSerializer().serializeToString("), f);
    assert.match(s, /exportSvgMarkup\(/, f);
  }
  assert.match(src("lib/striplogSvg.js"), /font-family="\$\{FIGURE_FONT/);
  assert.match(src("lib/svgExport.js"), /export const FIGURE_FONT = "'Exo 2', 'Segoe UI', system-ui, sans-serif"/);
});
