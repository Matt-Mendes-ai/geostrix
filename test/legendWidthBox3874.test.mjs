// TASKS.csv #3874 (#3757 / #3716 (1)) — the Layout inspector gives the Legend a width box (mm), beside its height and columns. Wiring only: the box writes the element's width.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3874 the Legend's W (mm) box writes its width (px = mm x PX_PER_MM), blank is auto, 20 mm at least", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /aria-label=\{tr\("Legend width \(mm\)"\)\}/);
  assert.match(m, /updateSelected\(\{ w: e\.target\.value === "" \|\| !\(v > 0\) \? undefined : Math\.max\(20, v\) \* PX_PER_MM \}\)/);
  assert.match(m, /value=\{Number\(sel\.w\) > 0 \? mm\(sel\.w\) : ""\}/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))["Legend width (mm)"], lang);
});
