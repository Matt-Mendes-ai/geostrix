// TASKS.csv #2201 (review #2174, WA gold) — '1 element', not '1 elements', in the assay counts: a singular / plural pair of keys
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAIRS = [
  ["{assays} intervals · 1 element", "{assays} intervals · {assayElements} elements"],
  ["Loaded {rows} {v} intervals (1 element).{v2}", "Loaded {rows} {v} intervals ({chosen} elements).{v2}"],
  ["Loaded {rows} surface samples (1 element). Switch to 3D View to see them.{v}", "Loaded {rows} surface samples ({chosen} elements). Switch to 3D View to see them.{v}"],
  ["{v} · 1 element recognized", "{v} · {elements} elements recognized"],
];

test("each count picks the singular key for one element", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  const a = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  for (const [one, many] of PAIRS) {
    const src = one.startsWith("{v} ·") ? a : g;
    assert.ok(src.includes(`=== 1 ? ${JSON.stringify(one)} : ${JSON.stringify(many)}`), one);
  }
});

test("both forms are in every dictionary (the i18n check cannot see keys inside a ternary)", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const pair of PAIRS) for (const k of pair) assert.ok(typeof d[k] === "string" && d[k].length, `${lang}: ${k}`);
  }
});
