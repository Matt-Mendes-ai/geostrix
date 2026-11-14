// TASKS.csv #3259 (Galore review) — a section along a steep 694 m hole opened 1,037 x 3,009 px in a 464 px tall view, fitted to the width only.
// 'Fit to window' (on to start with, remembered) caps the drawing's height at the window's on screen, so it fits both ways at its VE.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const w = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");

test("the fit: a class on the scroll area and a screen-only cap on the drawing's height", () => {
  assert.match(w, /className=\{`ge-section-body\$\{fitWhole \? " ge-section-fit" : ""\}`\}/);
  assert.match(w, /\{fitWhole && <style>\{"@media screen \{ \.ge-section-fit > svg \{ max-height: calc\(100vh - 250px\); height: auto; \} \}"\}<\/style>\}/);
  assert.match(w, /const pt = svg\.createSVGPoint\(\); pt\.x = e\.clientX; pt\.y = e\.clientY;\r?\n\s+const ctm = svg\.getScreenCTM\(\);/, "clicks map through the SVG's own transform, so a scaled drawing still picks right");
});

test("the toggle: on to start with, remembered on this computer", () => {
  assert.match(w, /useState\(\(\) => \{ try \{ return localStorage\.getItem\("geostrix\.sectionFit"\) !== "0"; \} catch \{ return true; \} \}\)/);
  assert.match(w, /<input type="checkbox" checked=\{fitWhole\} onChange=\{\(e\) => setFitWhole\(e\.target\.checked\)\} \/>\{tr\("Fit to window"\)\}/);
});
