// TASKS.csv #2362 (review #2325, WA uranium) — sections and the level plan draw the assay source the 3D view shows, without QC rows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPxrfRow } from "../src/lib/qaqc.js";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the section / level-plan assay points apply the 3D markers' two tests", () => {
  assert.match(v, /const vals = assays\.filter\(\(a\) => holeIds\.has\(a\.hole_id\) && a\.values\[sym\] != null && !isMarkedQcRow\(a\) && assayRowShown\(a\) && assayPassesCutoff\(a\.values\[sym\], style\)\);/);
  // the same two the 3D markers use
  assert.match(v, /if \(!a\.hole_id \|\| isMarkedQcRow\(a\) \|\| !assayRowShown\(a\)\) return;/);
  // the section opens with the current source: reopenSection is rebuilt when it changes
  assert.match(v, /assayStyle, assayRowShown \/\* #2362 \*\/, isRowVisible,/);
});

test("a pXRF reading that is shown says so, on the point and on the section's grade label", () => {
  assert.equal(isPxrfRow({ source: "pXRF" }), true); assert.equal(isPxrfRow({}), false);
  assert.match(v, /label: `\$\{sym\}: \$\{v\}\$\{px \? " \(pXRF\)" : ""\}`/);
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /\+ \(a\.pxrf \? " \(pXRF\)" : ""\)/);
});
