// TASKS.csv #4029 — a grade run with 'Also draw grade shells' asks the finer blocks a unit's body asks (bodiesBlockSize), states the extra seconds before the run, and does not
// when the tick is off. The rate is measured on the add-on (3,240 blocks of 50 m in about 3 s, 25,920 of 25 m in about 7 s).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bodiesBlockSize, blockPlan, modelBox, gradeExtraSeconds, GRADE_S_PER_BLOCK, BLOCK_CAP } from "../src/lib/geomlBodies.js";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4029 the grade qualities' blocks go to half the size, never under 10 m: Fast 50 -> 25, Standard 30 -> 15, Detailed 20 -> 10", () => {
  assert.deepEqual([50, 30, 20].map(bodiesBlockSize), [25, 15, 10]);
  assert.equal(bodiesBlockSize(12), 10, "never under 10 m");
});

test("#4029 the made-up copper's box: 25 m blocks are about 32,000 against about 4,000 at 50 m, inside the add-on's cap, and the extra is stated", () => {
  const box = modelBox([{ x: 0, y: 0, z: 0, length: 400 }, { x: 800, y: 800, z: 0, length: 400 }]);
  const fine = blockPlan(box, bodiesBlockSize(50)), plain = blockPlan(box, 50);
  assert.equal(fine.blocks, 32000); assert.equal(plain.blocks, 4000); assert.ok(fine.blocks <= BLOCK_CAP);
  const extra = gradeExtraSeconds(fine.blocks, plain.blocks);
  assert.ok(extra >= 5 && extra <= 7, `about ${extra} s`);
});

test("#4029 the rate is the measured one: about 0.2 ms a block; at the 100,000-block cap about 20 s; nothing when the blocks are not finer", () => {
  assert.equal(GRADE_S_PER_BLOCK, 0.0002);
  assert.equal(Math.round(gradeExtraSeconds(BLOCK_CAP, 0)), 20);
  assert.equal(gradeExtraSeconds(3000, 4000), 0);
  // the measured stage times: 25,920 blocks - 3,240 blocks at the rate is about the 4 s seen between 3 s and 7 s
  const measured = gradeExtraSeconds(25920, 3240);
  assert.ok(measured > 3.5 && measured < 6, `${measured}`);
});

test("#4029 the wiring: the grade run asks the finer blocks only with the shells tick on, the cost line is in the grade box, and the unit's line is the same sentence", () => {
  const p = read("src/components/PredictivePanel.jsx");
  assert.match(p, /gradeParams\.block_size = gradeSize\.m;/); // #4054: halved with the shells tick (resolveBlockM), a typed value wins
  assert.match(p, /halved: shellsOn/);
  assert.match(p, /run\(gradeLabel, "grade", gradeParams, async/);
  assert.match(p, /const gradeParams = \{ \.\.\.holes\(\), samples, element, \.\.\.QUALITY\[quality\]\.grade, composite: gq\.composite \};/, "the quality's own settings are the base: the tick off sends exactly what was sent before");
  assert.match(p, /extra=\{gradeBlocks \? extraTime\(gradeExtraSeconds\(gradeBlocks\.blocks, gradeBlocks\.baseBlocks\)\) : ""\}/);
  assert.equal((read("src/components/GeomlBlockSize.jsx").match(/tr\("\{c\} m blocks \(about \{n\}, not \{n0\}\): about \{t\} more after training\."/g) || []).length, 1, "one sentence for the unit's body and the grade's shells, in the Block size box (#4054)");
  assert.doesNotMatch(p, /blocks for a body \(about/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); assert.ok(d["{c} m blocks (about {n}, not {n0}): about {t} more after training."], lang); assert.equal(d["{c} m blocks for a body (about {n}, not {n0}): about {t} more after training."], undefined, lang); }
});
