// TASKS.csv #3768 (Scottie Gold review) — an outline's snaps stay on the section plane; a hole's dashed part (outside the buffer) is never a snap target; the link refusal names an
// off-plane vertex. Synthetic geometry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { snapClick, onSectionPlane } from "../src/lib/sectionDigitise.js";
import { offPlaneOutlines, offPlaneText } from "../src/lib/wireframe.js";

// a section along x (a = (0,0), b = (100,0)); a hole whose trace runs from (50, 41) at z 0 down to (50, 41) at z -100: 41 m off the plane, outside a ±30 m buffer
const trace = [{ md: 0, x: 50, y: 41, z: 0 }, { md: 100, x: 50, y: 41, z: -100 }];
const holes = [{ hole_id: "FAR", trace, runs: [] }, { hole_id: "NEAR", trace: [{ md: 0, x: 20, y: 3, z: 0 }, { md: 100, x: 20, y: 3, z: -100 }], runs: [[0, 100]] }];
const targets = [{ hole_id: "FAR", md: 50, label: "X" }, { hole_id: "NEAR", md: 50, label: "X" }];
const args = (extra = {}) => ({ holes, targets, toScreen: (x, y, z) => [x * 4, -z * 4], along: (x) => x, radius: 12, ...extra });

test("a hole outside the buffer (no run in the corridor) is not a snap target; one inside is", () => {
  assert.equal(snapClick({ sx: 200, sy: 200 }, args({ targets: [targets[0]] })), null, "FAR at x 50, z -50 -> screen (200, 200): not snapped");
  const s = snapClick({ sx: 80, sy: 200 }, args({ targets: [targets[1]] }));
  assert.ok(s && s.hole_id === "NEAR" && s.snap === "boundary");
  // a hole with only part of its length in the corridor: a target in the dashed part is refused, one in the solid part is taken
  const partial = [{ hole_id: "NEAR", trace: holes[1].trace, runs: [[0, 40]] }];
  assert.equal(snapClick({ sx: 80, sy: 200 }, { ...args(), holes: partial, targets: [targets[1]] }), null);
  assert.ok(snapClick({ sx: 80, sy: 80 }, { ...args(), holes: partial, targets: [{ hole_id: "NEAR", md: 20 }] }));
});

test("onSectionPlane keeps a snapped point on the section plane (the hole's real position moves onto it)", () => {
  const p = onSectionPlane({ hole_id: "FAR", l: 50, z: -50, x: 50, y: 41 }, { ax: 0, ay: 0, ux: 1, uy: 0 });
  assert.deepEqual([p.x, p.y, p.z, p.projected], [50, 0, -50, true]);
});

test("the link refusal names the outline with a vertex off its plane and the hole it snapped to", () => {
  const sec = (name, off) => ({ section: name, ax: 0, ay: 0, bx: 100, by: 0, points: [{ x: 10, y: 0, z: 0 }, { x: 50, y: off, z: -50, hole_id: off ? "DH23-309" : undefined }, { x: 90, y: 0, z: 0 }] });
  const bad = offPlaneOutlines([sec("S1", 41.2), sec("S2", 0), sec("S3", 6.5)]);
  assert.deepEqual(bad.map((b) => [b.section, Math.round(b.maxM * 10) / 10, b.hole_id]), [["S1", 41.2, "DH23-309"], ["S3", 6.5, "DH23-309"]]);
  assert.equal(offPlaneText([sec("S2", 0)]), "");
  assert.match(offPlaneText([sec("S1", 41.2), sec("S3", 6.5)]), /^ 2 outline\(s\) have a vertex off their section's plane: the worst is 41\.2 m off S1 \(snapped to DH23-309\)\./);
});

test("wiring: an outline's snaps stay on the plane by default, locked in the window; the refusal carries the cause", () => {
  const w = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /const outlineOnPlane = editing \? \(editing\.kind \|\| "contact"\) === "outline" : !!drawing && kindPick === "outline";/);
  assert.match(w, /projectSnaps=\{projectSnaps \|\| outlineOnPlane\}/);
  assert.match(w, /checked=\{projectSnaps \|\| outlineOnPlane\} disabled=\{outlineOnPlane\}/);
  assert.match(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /windingConflicts \}\) \+ offPlaneText\(outlines\)\); \/\/ #3768/);
});
