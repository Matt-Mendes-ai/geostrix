// TASKS.csv #2107 (review #2013, Woodjam) — a stope's 'Ore above cut-off' is the tonnes of its BLOCKS at or above the cut-off, not
// its ore columns' whole-slab tonnes; with no skin a stope whose columns pass on their mean can still hold below-cut-off blocks.
import test from "node:test";
import assert from "node:assert/strict";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";

// Woodjam's 831 m stope: two 10 m columns, each two 10 m blocks over a 20 m level (2809 / 3259 and 2805 / 3437 ppm), cut-off 3000
const model = () => ({ cells: [
  { x: 5, y: 5, z: 836, dx: 10, dy: 10, dz: 10, value: 2809 }, { x: 5, y: 5, z: 846, dx: 10, dy: 10, dz: 10, value: 3259 },
  { x: 15, y: 5, z: 836, dx: 10, dy: 10, dz: 10, value: 2805 }, { x: 15, y: 5, z: 846, dx: 10, dy: 10, dz: 10, value: 3437 },
] });

test("only the two blocks at or above 3000 ppm are ore; dilution is no longer 0 %", () => {
  const r = stopeOutlines(model(), { cutoff: 3000, levelH: 20, zMin: 831, zMax: 851, minWidth: 0, minLength: 0, skin: 0, density: 2.63 });
  const s = r.levels[0].stopes[0];
  const blockT = 10 * 10 * 10 * 2.63;
  assert.equal(s.columns, 2);
  assert.ok(Math.abs(s.tonnes - 4 * blockT) < 1e-6);
  assert.ok(Math.abs(s.grade - (2809 + 3259 + 2805 + 3437) / 4) < 1e-9); // 3077.5, as the review read
  assert.ok(Math.abs(s.oreTonnes - 2 * blockT) < 1e-6, `${s.oreTonnes}`); // 5,260 t, not 10,520
  assert.ok(Math.abs(s.oreGrade - (3259 + 3437) / 2) < 1e-9); // 3348 ppm
  assert.ok(Math.abs(r.totals.dilutionPct - 100) < 1e-9);
});

test("a stope of all-ore blocks still has equal ore and diluted tonnes", () => {
  const m = model(); m.cells.forEach((c) => { c.value = 4000; });
  const s = stopeOutlines(m, { cutoff: 3000, levelH: 20, zMin: 831, zMax: 851, skin: 0, density: 2.63 }).levels[0].stopes[0];
  assert.ok(Math.abs(s.oreTonnes - s.tonnes) < 1e-9);
});
