// TASKS.csv #3003 (review #2876, WA iron) — small slips in Mine Design: (1) pits that differ only by their density table had the same name;
// (2) a solid's blocks were given by their plan size alone on 25 x 25 x 2 m cells; (3) 'Dilution 13 %' two lines above 'No dilution counted';
// (6) ore samples in cells the estimate left empty inside the pit were mined as waste unannounced.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { drilledOutsideModel } from "../src/lib/pitDrilledOutside.js";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("#3003 (6) ore samples in an empty cell of the model's footprint inside the pit are counted apart", () => {
  // a 5 x 5 x 3 model of 10 m blocks with the centre block of the middle level missing; a pit over all of it (floor at z 0)
  const cells = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) if (!(i === 2 && j === 2 && k === 1)) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 30 });
  // the pit: a flat mesh at z 0 over the model (a floor under everything)
  const positions = Float64Array.from([-10, -10, 0, 60, -10, 0, 60, 60, 0, -10, 60, 0]), indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
  const trace = [{ md: 0, x: 25, y: 25, z: 30 }, { md: 30, x: 25, y: 25, z: 0 }];
  const samples = [{ hole_id: "H", from: 13, to: 17, value: 60 } /* z 15: the empty block */, { hole_id: "H", from: 3, to: 7, value: 60 } /* z 25: a model block */];
  const r = drilledOutsideModel(cells, samples, new Map([["H", trace]]), { positions, indices, cellM: 10 }, 55);
  assert.equal(r.gap.oreSamples, 1); assert.equal(r.gap.oreMetres, 4); assert.deepEqual(r.gap.holeIds, ["H"]);
  assert.equal(r.samples, 0, "not 'outside the model' either");
});

test("#3003 (1)(2)(3)(6) the panes", () => {
  const p = read("components/PitShellPane.jsx");
  assert.ok(p.includes('tr(", density by {layer} ({n} codes)"'), "(1) the pit name");
  assert.ok(p.includes("if (element && assays.length) {"), "(6) computed with any assays");
  assert.ok(p.includes("res.outside?.gap?.oreSamples > 0"), "(6) said");
  assert.ok(read("components/DesignStringsPane.jsx").includes('blockM = c0 ? [c0.dx, c0.dy, c0.dz].map((v) => Math.round(v * 10) / 10).join(" × ") : null'), "(2)");
  const s = read("components/StopesPane.jsx");
  assert.ok(s.includes('tr("Internal dilution")') && s.includes("The dilution above is internal only"), "(3)");
});
