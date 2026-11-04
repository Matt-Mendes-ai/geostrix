// TASKS.csv #1884 / #1885 / #1893 — a patch whose hole touches the outside at a corner (Lawyers, 53.5 m blocks) no longer throws;
// the effective width and skin, the ore-column count and an inverted RL range come back
import test from "node:test";
import assert from "node:assert/strict";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

// one level of 10 m blocks: rows from the north, '#' ore (grade 3), '.' waste (grade 0)
//   ###
//   ###
//   #.#      <- a one-column hole at (1, 2)
//   ##.      <- outside at (2, 3): the hole and the outside touch at a corner
function pinched() {
  const rows = ["###", "###", "#.#", "##."];
  const cells = [];
  rows.forEach((r, j) => [...r].forEach((ch, i) => cells.push({ x: 1000 + i * 10 + 5, y: 2000 + (rows.length - 1 - j) * 10 + 5, z: 505, dx: 10, dy: 10, dz: 10, value: ch === "#" ? 3 : 0 })));
  return { name: "pinched", cells };
}

test("a hole touching the outside at a corner: one stope, one hole filled, a closed solid, no throw", () => {
  const r = stopeOutlines(pinched(), { cutoff: 1, levelH: 10, minWidth: 0, minLength: 0, skin: 0, density: 2 });
  assert.equal(r.levels.length, 1);
  const l = r.levels[0];
  assert.equal(l.stopes.length, 1, "the ore is one 4-connected patch");
  const s = l.stopes[0];
  assert.equal(s.columns, 10);
  assert.equal(s.holesFilled, 1, "the one-column hole is a loop of its own");
  assert.ok(s.positions && isMeshClosed(s.positions, s.indices), "the outer loop is simple: the solid builds and closes");
  assert.ok(Math.abs(s.volume - 11 * 100 * 10) < 1e-6, `the solid fills the hole: ${s.volume}`);
  assert.ok(Math.abs(s.tonnes - 10 * 100 * 10 * 2) < 1e-6, "the tonnes count the ore columns only (no skin)");
  assert.equal(r.unbuilt, 0);
  assert.equal(r.oreColumns, 10);
});

test("the effective width and skin in whole columns, and the empty-run reasons", () => {
  const r = stopeOutlines(pinched(), { cutoff: 1, levelH: 10, minWidth: 5, minLength: 0, skin: 2, density: 2 });
  assert.equal(r.widthCols, 1); assert.equal(r.skinCols, 0); assert.equal(r.blockH, 10);
  const r2 = stopeOutlines(pinched(), { cutoff: 1, levelH: 10, minWidth: 12, minLength: 0, skin: 6, density: 2 });
  assert.equal(r2.widthCols, 2); assert.equal(r2.skinCols, 1);
  const none = stopeOutlines(pinched(), { cutoff: 5, levelH: 10, density: 2 });
  assert.equal(none.totals.stopes, 0); assert.equal(none.oreColumns, 0);
  const narrow = stopeOutlines(pinched(), { cutoff: 1, levelH: 10, minWidth: 40, density: 2 });
  assert.equal(narrow.totals.stopes, 0); assert.ok(narrow.oreColumns > 0, "columns reach the cut-off but no patch is four wide");
  assert.deepEqual(stopeOutlines(pinched(), { cutoff: 1, levelH: 10, zMin: 600, zMax: 500, density: 2 }).failed, "range");
});
