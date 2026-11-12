// TASKS.csv #1873 (Matt's decision: for now, explain) — an empty Atlas mode says why it is empty and what fills it: a geophysics-only
// project has no collars and no sections
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
const keys = [
  "No hole matches the filter.",
  "No collar has a depth, so no hole has a trace to make a page from.",
  "No holes have collars, so there is no page per hole: import collars, or use one page per section.",
  "No sections drawn yet: draw one with Draw section in the 3D View, then make one page per section here.",
];

test("each empty case has its own message", () => {
  for (const k of keys) assert.ok(m.includes(`tr(${JSON.stringify(k)})`), k);
  assert.doesNotMatch(m, /tr\("No collars loaded\."\)/);
});

test("the messages are in every dictionary (they sit in a ternary, which i18n786 does not see)", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of keys) assert.ok(d[k], `${lang}: ${k}`);
  }
});
