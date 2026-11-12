// TASKS.csv #2707 (split from #2201) — the surface-sample import dialog read '1 elements recognized'; the assay dialog already had its singular.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the surface-sample dialog says '1 element recognized' for one element", () => {
  const src = readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8");
  assert.match(src, /modal\.elements\.length === 1 \? tr\("1 element recognized"\)[^:]*: tr\("\{elements\} elements recognized", \{ elements: modal\.elements\.length \}\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["1 element recognized"], lang);
  }
});
