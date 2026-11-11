// TASKS.csv #2316 (first step) — the assay import says that a loss-on-ignition column was not imported, until LOI has a field of its own
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("the LOI header pattern used by the notice", () => {
  const src = g.match(/filter\(\(h\) => (\/\^loi[^\n]*?\/i)\.test\(String\(h\)\.trim\(\)\)\)/);
  assert.ok(src, "pattern");
  const re = new RegExp(src[1].slice(1, -2), "i"); // the literal '/.../i' from the source
  for (const h of ["LOI", "LOI1000_XRF_pct", "LOITOTAL", "LOI371", "LOI650", "LOI_pct", "loi %"]) assert.ok(re.test(h), h);
  for (const h of ["Location", "LOIS", "Au_ppm", "Lobe"]) assert.ok(!re.test(h), h);
});

test("the notice and its key", () => {
  assert.match(g, /tr\("Not imported: \{cols\} \(loss on ignition is not an element, and the assays do not keep it yet\)\.", \{ cols: loi\.join\(", "\) \}\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["Not imported: {cols} (loss on ignition is not an element, and the assays do not keep it yet)."], lang);
  }
});
