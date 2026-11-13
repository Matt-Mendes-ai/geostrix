// TASKS.csv #3084 (split from #2995) — the other grades of the same blocks (SiO2 beside Fe) in Pit design's bench table, the Nested pits series,
// Stope outlines, a solid's contents line and their CSVs (Pit shell's result had them since #2995).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shellFloors, benchedPit, benchTableRows } from "../src/lib/pitDesign.js";
import { runPitSeries, joinAlso } from "../src/lib/pitShell.js";
import { stopeOutlines, stopeRows } from "../src/lib/stopeOutlines.js";
import { solidTonnage } from "../src/lib/stringSolids.js";

test("#3084 Pit design: each bench's other grade over its ore, the totals, the table rows / CSV", () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1003);
  const shell = shellFloors(Float64Array.from(pos), () => 1003);
  // ore blocks inside the pit, SiO2 4 in the upper half and 8 in the lower
  const cells = [];
  for (let x = -40; x <= 40; x += 10) for (let y = -40; y <= 40; y += 10) for (let z = 945; z < 1000; z += 10) cells.push({ x: 500000 + x, y: 5000000 + y, z, dx: 10, dy: 10, dz: 10, value: 60, also: [z >= 975 ? 4 : 8] });
  const d = benchedPit(shell, { groundAt: () => 1003, benchH: 10, berm: 5, batterDeg: 60, cells, cutoff: 55, density: 2.9 });
  const withOre = d.benches.filter((b) => b.oreT > 0);
  assert.ok(withOre.length >= 2);
  for (const b of withOre) assert.ok(b.alsoGrades[0] === 4 || b.alsoGrades[0] === 8 || (b.alsoGrades[0] > 4 && b.alsoGrades[0] < 8), `${b.rl}: ${b.alsoGrades[0]}`);
  assert.ok(d.totals.alsoGrades[0].meanGrade > 4 && d.totals.alsoGrades[0].meanGrade < 8); assert.equal(d.totals.alsoGrades[0].oreShare, 1);
  const rows = benchTableRows(d.benches, "%", ["SiO2 (%)"]);
  assert.ok("mean_SiO2 (%)" in rows[0]);
  assert.ok(!("mean_SiO2 (%)" in benchTableRows(d.benches, "%")[0]), "no column when none asked");
});

test("#3084 Nested pits: each shell of the series carries the other grades", () => {
  const cells = [], si = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 10; k++) { const c = { x: i * 10 + 5, y: j * 10 + 5, z: 400 + k * 4 + 2, dx: 10, dy: 10, dz: 4 }, ore = i > 2 && i < 8 && j > 2 && j < 8 && k < 6; cells.push({ ...c, value: ore ? 60 : 30 }); si.push({ ...c, value: ore ? 6 : 40 }); }
  const s = runPitSeries({ unit: "%", element: "Fe", price: 161.29, priceUnit: "t", recovery: 100, miningCost: 3, processingCost: 35, density: 2.9, slopeDeg: 45, typedCutoff: 55, cells, alsoCells: [{ cells: si }] }, [0.8, 1], { groundAt: () => 440 });
  assert.ok(s.runs.every((r) => r.also?.[0]?.meanGrade === 6), JSON.stringify(s.runs.map((r) => r.also)));
});

test("#3084 Stope outlines: each stope, level and total; the CSV rows", () => {
  const cells = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 6; k++) cells.push({ x: 3 + i * 6, y: 3 + j * 6, z: 303 + k * 6, dx: 6, dy: 6, dz: 6, value: 500, also: [i < 5 ? 2 : 4] });
  const r = stopeOutlines({ cells }, { cutoff: 200, levelH: 6, density: 1.9 });
  assert.ok(r.levels.length > 0 && r.levels.every((l) => l.stopes.every((st) => st.alsoGrades[0] > 2 && st.alsoGrades[0] < 4)));
  assert.ok(Math.abs(r.totals.alsoGrades[0] - 3) < 1e-9, String(r.totals.alsoGrades[0]));
  assert.ok("mean_SiO2 (%)" in stopeRows(r, "ppm", ["SiO2 (%)"])[0]);
  assert.equal(stopeOutlines({ cells: cells.map(({ also, ...c }) => c) }, { cutoff: 200, levelH: 6, density: 1.9 }).totals.alsoGrades.length, 0, "none asked: none");
});

test("#3084 a solid's contents: the other grades of the blocks inside it; the panes wire it", () => {
  // a 20 m cube solid around 8 blocks of 10 m, two of them with SiO2
  const P = [0, 0, 0, 20, 0, 0, 20, 20, 0, 0, 20, 0, 0, 0, 20, 20, 0, 20, 20, 20, 20, 0, 20, 20];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  const blocks = []; for (const x of [5, 15]) for (const y of [5, 15]) for (const z of [5, 15]) blocks.push({ x, y, z, dx: 10, dy: 10, dz: 10, value: 60 });
  const cells = joinAlso(blocks, [{ cells: [{ x: 5, y: 5, z: 5, value: 3 }, { x: 15, y: 15, z: 15, value: 5 }] }]).cells;
  const t = solidTonnage(Float64Array.from(P), Uint32Array.from(I), cells, 2.9);
  assert.equal(t.blocks, 8); assert.equal(t.alsoGrades[0], 4, "over the two blocks that have a value");
  for (const [f, k] of [["components/PitDesignPane.jsx", "alsoPairs.map(({ m }) => m) /* #3084 */"], ["components/NestedPitsPane.jsx", "alsoModels: alsoPairs.map(({ m }) => m) /* #3084 */"], ["components/StopesPane.jsx", "groundIn, alsoChosen /* #3084 */"], ["components/DesignStringsPane.jsx", "solidTonnage(r.positions, r.indices, cellsWithAlso() /* #3084 */"]])
    assert.ok(fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").includes(k), f);
});
