// TASKS.csv #2316 (first step) — the assay import says that a loss-on-ignition column was not imported. Since #2734 LOI is kept as the
// field 'LOI', and the notice names only the LOI columns it was not read from.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLoiHeader } from "../src/lib/geochem.js";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("the LOI header pattern (lib/geochem.js isLoiHeader, #2734)", () => {
  for (const h of ["LOI", "LOI1000_XRF_pct", "LOITOTAL", "LOI371", "LOI650", "LOI_pct", "loi %", "LOI (%)"]) assert.ok(isLoiHeader(h), h);
  for (const h of ["Location", "LOIS", "Au_ppm", "Lobe"]) assert.ok(!isLoiHeader(h), h);
});

test("the notice and its keys", () => {
  assert.match(g, /\.filter\(\(h\) => isLoiHeader\(h\) && !took\.has\(h\)\)/);
  const keys = ["Not imported: {cols} (LOI was read from {main}).", "Not imported: {cols} (loss on ignition: tick LOI in the element list to keep it)."];
  for (const k of keys) assert.ok(g.includes(`tr(${JSON.stringify(k)}`), k);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of keys) assert.ok(d[k], `${lang}: ${k}`);
  }
});
