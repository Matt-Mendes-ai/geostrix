// TASKS.csv #3802 — a member of an estimate set (Ag, Pb beside Zn) restricted by default takes its own element's closed grade shell when it has one,
// not the primary's. SYNTHETIC solids.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ownShellFor } from "../src/lib/estimatePlane.js";

const box = (id, name, params, s = 10) => {
  const P = [0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { id, name, positions: Float64Array.from(P), indices: Uint32Array.from(I), params };
};
const shells = [box("z", "Zn > 2 % shell", { tool: "numeric grade shell", element: "Zn", cutoff: 2 }), box("a", "Ag > 30 g/t shell", { tool: "numeric grade shell", element: "Ag", cutoff: 30 }, 6),
  box("p", "Pb > 1 % shell", { tool: "numeric grade shell", element: "Pb", cutoff: 1 })];

test("a member takes its own closed grade shell under the default; not when the restriction was picked, off, or it has none", () => {
  assert.equal(ownShellFor(shells, "Ag", { auto: true, primaryId: "z" }).id, "a");
  assert.equal(ownShellFor(shells, "Pb", { auto: true, primaryId: "z" }).id, "p");
  assert.equal(ownShellFor(shells, "Ag", { auto: false, primaryId: "z" }), null, "a solid the user picked restricts every element");
  assert.equal(ownShellFor(shells, "Cu", { auto: true, primaryId: "z" }), null, "no shell of its own: the primary's");
  assert.equal(ownShellFor(shells, "Zn", { auto: true, primaryId: "z" }), null, "the primary's own shell is the primary's");
  assert.equal(ownShellFor(shells.filter((s) => s.id !== "a"), "Ag", { auto: true, primaryId: "z" }), null);
});

test("wiring: the member's samples and blocks are tested against its own solid, and its record says so", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const own = ownShellFor\(volumeShells, el, \{ auto: shellAuto, primaryId: shellId \}\);/);
  assert.match(m, /const msh = inShell \? await shellOfMember\(el\) : null, mAll = mp\.length; \/\/ #3802/);
  assert.match(m, /if \(msh\) mp = mp\.filter\(\(q\) => msh\.inShell\(q\)\);/);
  assert.match(m, /inShell: msh \? msh\.inShell : inShell, inArea, groundAt: cutGround/);
  assert.match(m, /restrictedToVolumeName: msh\.name, restrictedByDefault: `the element's own closed grade shell/);
});

test("a member that took its own shell is named for it, not the primary's", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /nm\.split\(prim\)\.join\(mine\)[^\n]*m\.params\?\.restrictedToVolumeName, result\.params\?\.restrictedToVolumeName\)/);
});
