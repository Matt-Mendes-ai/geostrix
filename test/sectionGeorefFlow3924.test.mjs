// TASKS.csv #3924 — georeferencing a section figure asks for its line first and never places it on one by default. A SYNTHETIC project only:
// three E-W section lines 200 m apart and figures placed on them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionLine, imageLine, imagesOnLine, moveSectionImage, planFrame } from "../src/lib/sectionGeoref.js";

const L1 = sectionLine({ x: 1000, y: 5000 }, { x: 2000, y: 5000 }), L2 = sectionLine({ x: 1000, y: 5200 }, { x: 2000, y: 5200 });
const placed = { id: "a", name: "Figure A", line: { a: { x: 1000, y: 5000 }, b: { x: 2000, y: 5000 } },
  corners: [[1100, 5000, 600], [1700, 5000, 600], [1700, 5000, 200], [1100, 5000, 200]] }; // 100 - 700 m along L1

test("the repeated-line warning: a second figure on the same line is named; one on its own line is not", () => {
  assert.deepEqual(imagesOnLine([placed], L1), [{ id: "a", name: "Figure A" }]);
  assert.deepEqual(imagesOnLine([placed], sectionLine({ x: 2000, y: 5003 }, { x: 900, y: 5003 })).map((m) => m.id), ["a"]); // the same line drawn the other way, 3 m off
  assert.deepEqual(imagesOnLine([placed], L2), []); // 200 m north: a different section
  assert.deepEqual(imagesOnLine([placed], L1, "a"), []); // the figure itself, when it is the one being moved
  assert.deepEqual(imagesOnLine([{ ...placed, visible: false }], L1).length, 1); // a hidden figure still stands there
});

test("moving a figure to another line keeps its place along the line and its elevations, without its control points", () => {
  const { patch, fromDist, toDist } = moveSectionImage(placed, L2);
  assert.deepEqual(patch.corners, [[1100, 5200, 600], [1700, 5200, 600], [1700, 5200, 200], [1100, 5200, 200]]);
  assert.deepEqual(patch.line, { a: { x: 1000, y: 5200 }, b: { x: 2000, y: 5200 } });
  assert.deepEqual([fromDist, toDist], [100, 700]);
  assert.equal(patch.corners0, undefined);
  // onto a N-S line: 100 m along becomes 100 m north of its start
  const ns = sectionLine({ x: 3000, y: 4000 }, { x: 3000, y: 5000 });
  const m = moveSectionImage(placed, ns).patch.corners;
  for (const [i, d] of [[0, 100], [1, 700]]) { assert.ok(Math.abs(m[i][0] - 3000) < 1e-9); assert.ok(Math.abs(m[i][1] - (4000 + d)) < 1e-9); }
  // a fit at each point (#3929) keeps its original corners: they move too, so Back lands on the new line
  const warped = { ...placed, corners0: placed.corners.map(([x, y, z]) => [x, y, z - 10]) };
  assert.deepEqual(moveSectionImage(warped, L2).patch.corners0[0], [1100, 5200, 590]);
  // an older figure saved without its line: the line through its top corners
  const old = { ...placed, line: undefined };
  assert.deepEqual(imageLine(old).a, { x: 1100, y: 5000 });
  assert.deepEqual(moveSectionImage(old, L2).patch.corners[0], [1000, 5200, 600]); // its left edge at the new line's start
  assert.throws(() => moveSectionImage({ id: "x" }, L2), /no position/);
});

test("the plan frames the collars, the saved sections, the figures and the chosen line, square, with a margin", () => {
  assert.equal(planFrame({}), null);
  const f = planFrame({ collars: [{ x: 1500, y: 5100 }], sections: [{ ax: 1000, ay: 5000, bx: 2000, by: 5000 }], images: [placed], line: L2 });
  assert.ok(f.x0 < 1000 && f.x1 > 2000 && f.y0 < 5000 && f.y1 > 5200);
  assert.ok(Math.abs((f.x1 - f.x0) - (f.y1 - f.y0)) < 1e-9);
  const one = planFrame({ collars: [{ x: 10, y: 20 }] });
  assert.ok(one.x1 - one.x0 >= 100); // a single collar still gets a readable frame
});

test("wired: the dialog asks for the line first with nothing preselected, warns on a repeated line, previews on the plan, and moves a figure", () => {
  const m = readFileSync(new URL("../src/components/SectionGeorefModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const \[lineSrc, setLineSrc\] = useState\(""\);/); // no silent default
  assert.doesNotMatch(m, /sections\[0\]\.id/);
  assert.match(m, /const onLine = lineOk \? imagesOnLine\(images, line, moveImage\?\.id\) : \[\];/); // #4071: the guided flow
  assert.match(m, /<SectionLinePlan [^>]*extent=\{summary \? \{ from: summary\.fromDist, to: summary\.toDist \} : null\}/); // the preview (step 3)
  assert.match(m, /const m = moveSectionImage\(moveImage, line\); onMove\?\.\(m\.patch/);
  assert.match(m, /disabled=\{moveImage \? !lineOk : !stepOk \|\| busy\} onClick=\{moveImage \? doMove : next\}/); // no placing without a fit, no move without a line (#4071)
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /\{ label: tr\("Move to another line…"\), onClick: \(\) => setSectionGeorefOpen\(\{ moveId: im\.id \}\) \}/);
  assert.match(vm, /collars=\{collars\} images=\{sectionImages\}/);
  const plan = readFileSync(new URL("../src/components/SectionLinePlan.jsx", import.meta.url), "utf8");
  assert.match(plan, /onDrawn\?\.\(first, p\)/); // two clicks: the first is the left end
});
