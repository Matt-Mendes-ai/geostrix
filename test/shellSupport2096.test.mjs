// TASKS.csv #2096 (review #2013, Woodjam) — a Voxel-ranges shell cut from an estimate carries the data support of the cells in
// its range, so Undrilled zones can say "rests on one hole" for it as it does for a grade shell (#1725).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voxelShell } from "../src/lib/voxelShell.js";
import { unitSupport } from "../src/lib/unitSupport.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a 10 x 10 x 10 model of 10 m blocks; value = the distance from the centre, so hi: 25 is a ball in the middle
function model(decorate) {
  const cells = [];
  for (let k = 0; k < 10; k++) for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) {
    const x = 5 + i * 10, y = 5 + j * 10, z = 5 + k * 10, value = Math.hypot(x - 50, y - 50, z - 50);
    cells.push({ x, y, z, dx: 10, dy: 10, dz: 10, value, ...(decorate ? decorate(value) : {}) });
  }
  return { cells };
}

test("the cells in the range are counted by holes and by support class; a model without the fields records nothing", () => {
  // inside the ball every cell is one-hole and extrapolated; outside it two-hole and interpolated (so the shell's share is 100 %, the model's is not)
  const est = model((v) => (v <= 25 ? { nHoles: 1, support: "extrapolated" } : { nHoles: 2, support: "interpolated" }));
  const r = voxelShell(est, { hi: 25 });
  assert.ok(r && r.cellsInside > 50);
  assert.deepEqual(r.support, { cellsEstimated: r.cellsInside, singleHoleCells: r.cellsInside, supportCounts: { interpolated: 0, extrapolated: r.cellsInside, unsupported: 0 } });
  assert.deepEqual(unitSupport(r.support), { cells: r.cellsInside, oneHoleShare: 1, extrapolatedShare: 1, weak: true });
  // the complement: many holes, bracketed -> not weak
  const out = voxelShell(est, { lo: 26 });
  assert.equal(out.support.singleHoleCells, 0);
  assert.equal(unitSupport(out.support).weak, false);
  // holes only (support classification was off): the one-hole share alone
  const holesOnly = voxelShell(model(() => ({ nHoles: 1 })), { hi: 25 });
  assert.deepEqual(Object.keys(holesOnly.support), ["cellsEstimated", "singleHoleCells"]);
  assert.equal(unitSupport(holesOnly.support).extrapolatedShare, null);
  // an imported geophysics model: nothing to read, nothing stamped
  assert.equal(voxelShell(model(), { hi: 25 }).support, null);
  assert.equal(unitSupport(null), null);
});

test("the shell's params carry it, the notice says so for a thin estimate, and the pane names a shell with no record", () => {
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /\.\.\.\(r\.support \? \{ \.\.\.r\.support, supportOf: "the cells in the range" \} : \{\}\)/);
  assert.match(v, /const sup = unitSupport\(r\.support\);\n\s+if \(sup\?\.weak\) setNotices/);
  const u = read("src/components/UndrilledZonesPane.jsx");
  assert.match(u, /unit && !support && unit\.type === "geophysical_shell" && <div style=\{note\}>/);
  assert.match(u, /records no drillhole support/);
});
