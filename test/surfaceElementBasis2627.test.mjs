// TASKS.csv #2627 follow-up (#2641 needs it) — the surface samples' elements with an oxide get the reported-as select (ElementBasisSelect
// surface) under the samples' row in the 3D View sidebar (src/modules/viewer/SurfaceElementBasis.jsx).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { basisChoices } from "../src/lib/oxideBasisChange.js";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("only elements with an oxide choice are listed (the component's filter)", () => {
  const els = [{ symbol: "Li", unit: "%" }, { symbol: "Au", unit: "g/t" }, { symbol: "Cu", unit: "ppm" }, { symbol: "LiX", unit: "%", calculated: true }];
  const listed = els.filter((e) => basisChoices(e).length > 1).map((e) => e.symbol);
  assert.ok(listed.includes("Li"));
  assert.ok(!listed.includes("Au"));
  assert.ok(!listed.includes("LiX"));
  const src = read("../src/modules/viewer/SurfaceElementBasis.jsx");
  assert.match(src, /\(elements \|\| \[\]\)\.filter\(\(e\) => basisChoices\(e\)\.length > 1\)/);
  assert.match(src, /if \(!withOxide\.length\) return null;/);
  assert.match(src, /<ElementBasisSelect element=\{e\} surface onNotice=\{onNotice\} \/>/);
});

test("wiring: lazy in ViewerModule, under the 3D View's surface-sample row, notices to the module", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /const SurfaceElementBasis = React\.lazy\(\(\) => import\("\.\/viewer\/SurfaceElementBasis\.jsx"\)\);/);
  assert.match(v, /\{anomalyControls\}\{\/\* TASKS\.csv #843 \/ #854 \*\/\}\n\s+<Suspense fallback=\{null\}><SurfaceElementBasis elements=\{surfaceElements\} onNotice=\{\(n\) => setNotices\(\(p\) => \[\.\.\.p, n\]\)\} \/><\/Suspense>/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(read(`../src/locales/${l}.json`));
    assert.ok(j["Elements: reported as element or oxide ({n})"], l);
    assert.ok(j["Report a surface element as the element or as its oxide (Li or Li2O): every stored value is converted, in one undoable step."], l);
  }
});
