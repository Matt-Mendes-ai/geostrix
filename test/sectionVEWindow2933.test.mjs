// TASKS.csv #2933 (WA iron review) / #2387 — a section opens at the VE that fills the window's plot area (not a fixed 10:1 strip), a step's
// section keeps the user's VE, and the VE box is held to its stated range.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultSectionVE, plotAspect, MAX_SECTION_VE } from "../src/lib/sectionVE.js";

test("the review's section: 1,138 m by about 80 m in a 1084 x 655 window (a 190 px toolbar) opens at 4x (was 1x); round values, capped", () => {
  const a = plotAspect(1084, 655, 190);
  assert.ok(a > 0.28 && a < 0.30, String(a));
  assert.equal(plotAspect(1084, 655), a, "190 px until the toolbar is measured");
  assert.equal(defaultSectionVE(1138, 80, a), 4);
  assert.equal(defaultSectionVE(2600, 90, a), 8); // the WA uranium palaeochannel, in the same window
  assert.equal(defaultSectionVE(800, 600, a), 1); // deep: true scale
  assert.equal(defaultSectionVE(100000, 10, a), MAX_SECTION_VE);
  for (const L of [500, 1000, 3000]) assert.ok([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].includes(defaultSectionVE(L, 70, a)));
  assert.equal(defaultSectionVE(2600, 90), 3, "no window known: the #2363 rule");
  assert.equal(plotAspect(0, 600), null);
  assert.equal(plotAspect(2000, 300, 120), 0.15, "a very wide window is held at a strip");
});

test("wiring: the auto VE reads the window; a step hands its VE to the next tab; the box is clamped", () => {
  const s = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /defaultSectionVE\(len, maxZ - minZ, typeof window !== "undefined" \? plotAspect\(window\.innerWidth, window\.innerHeight, document\.querySelector\("\.ge-section-toolbar"\)\?\.offsetHeight\) : null\)/);
  assert.match(s, /const stepTo = \(msg\) => \{ if \(vExag != null\) stepVE = \{ ve: vExag, at: Date\.now\(\) \};/);
  assert.match(s, /setVExag\(Math\.min\(MAX_SECTION_VE, Math\.max\(0\.1, Number\(e\.target\.value\) \|\| 1\)\)\)/);
});
