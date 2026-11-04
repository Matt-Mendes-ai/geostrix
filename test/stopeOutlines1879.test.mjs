// TASKS.csv #1879 — stope outlines by level from a block model at a cut-off
import test from "node:test";
import assert from "node:assert/strict";
import { stopeOutlines, stopeRows } from "../src/lib/stopeOutlines.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

// 10 m blocks, 20 levels of 10 m: a 20 m wide, 60 m long ore zone (grade 5) running north, a 10 m stringer beside it (grade 6),
// barren rock (grade 0.1) everywhere else, from z 900 to 1,000
function model() {
  const cells = [];
  for (let k = 0; k < 10; k++) for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const x = 1000 + i * 10 + 5, y = 2000 + j * 10 + 5, z = 900 + k * 10 + 5;
    const zone = (i === 5 || i === 6) && j >= 3 && j <= 8, stringer = i === 9 && j >= 2 && j <= 9;
    cells.push({ x, y, z, dx: 10, dy: 10, dz: 10, value: zone ? 5 : stringer ? 6 : 0.1 });
  }
  return { name: "test", cells };
}

test("a 20 m zone survives a 15 m minimum width, a 10 m stringer does not; tonnes and grade by hand", () => {
  const r = stopeOutlines(model(), { cutoff: 1, levelH: 20, minWidth: 15, minLength: 30, skin: 0, density: 2.8 });
  assert.equal(r.levels.length, 5);
  for (const l of r.levels) {
    assert.equal(l.stopes.length, 1, `level ${l.rl}: ${l.stopes.length} stopes`);
    const s = l.stopes[0];
    assert.equal(s.columns, 12); // 2 x 6 columns
    assert.ok(Math.abs(s.tonnes - 12 * 100 * 20 * 2.8) < 1e-6);
    assert.ok(Math.abs(s.grade - 5) < 1e-9);
    assert.ok(isMeshClosed(s.positions, s.indices));
    assert.ok(Math.abs(s.volume - 12 * 100 * 20) < 1e-6);
    assert.equal(s.outline.length, 4, "a rectangle after dropping the collinear corners");
  }
  assert.equal(r.totals.stopes, 5); assert.ok(Math.abs(r.totals.grade - 5) < 1e-9); assert.equal(r.totals.dilutionPct, 0);
});

test("no minimum width keeps the stringer too; the skin dilutes with the rock's own grade", () => {
  const r0 = stopeOutlines(model(), { cutoff: 1, levelH: 10, minWidth: 0, minLength: 0, density: 2.8 });
  assert.equal(r0.levels[0].stopes.length, 2);
  const r = stopeOutlines(model(), { cutoff: 1, levelH: 10, minWidth: 15, minLength: 0, skin: 10, density: 2.8 });
  const s = r.levels[0].stopes[0];
  assert.equal(s.columns, 4 * 8, "one column of skin all round: 4 x 8");
  assert.ok(Math.abs(s.oreTonnes - 12 * 100 * 10 * 2.8) < 1e-6);
  assert.ok(Math.abs(s.oreGrade - 5) < 1e-9);
  const expectGrade = (12 * 5 + 20 * 0.1) / 32;
  assert.ok(Math.abs(s.grade - expectGrade) < 1e-9, `diluted grade ${s.grade}`);
  assert.ok(Math.abs(r.totals.dilutionPct - (20 / 12) * 100) < 1e-6);
  assert.ok(stopeRows(r, "g/t").length === r.levels.length && "grade_g/t" in stopeRows(r, "g/t")[0]);
});

test("level range and a too-short patch", () => {
  const r = stopeOutlines(model(), { cutoff: 1, levelH: 25, zMin: 925, zMax: 975, minWidth: 15, minLength: 100, density: 2.8 });
  assert.deepEqual(r.levels.map((l) => l.rl), [925, 950]);
  assert.ok(r.levels.every((l) => l.stopes.length === 0), "60 m long is shorter than the 100 m minimum");
});
