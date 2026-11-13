// TASKS.csv #3262 (review #3195, Galore Creek) — an intrusive's repeats were called 'thin beds of its neighbours in a flat pile' from the
// dip of its first tops alone, and the model check counted only the unit's own metres, not the other rock the model put inside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planeDipDeg, planeMisfitM, looksLikeFlatPile } from "../src/lib/pileTops.js";
import { modelledAsTally } from "../src/lib/modelCheck.js";

// 14 holes on a 160 m grid, collars at RL 690-801 (synthetic)
const grid = Array.from({ length: 14 }, (_, i) => ({ x: (i % 4) * 160, y: Math.floor(i / 4) * 160 }));
const flat = grid.map((g, i) => ({ ...g, z: 500 + 0.03 * g.x + ((i % 3) - 1) * 2 })); // a bed: within 2 m of a 1.7° plane
const intrusive = grid.map((g, i) => ({ ...g, z: 700 - [40, 310, 90, 220, 15, 380, 150, 60, 270, 120, 330, 30, 200, 100][i] })); // first i9 at 15-380 m down

test("#3262 first tops flat on average but scattered are not a flat pile", () => {
  assert.ok(planeDipDeg(intrusive) < 15, "flat on average, as on Galore (5.6°)");
  assert.ok(planeMisfitM(intrusive) > 80);
  assert.equal(looksLikeFlatPile({ dip: planeDipDeg(intrusive), misfit: planeMisfitM(intrusive), medianRunM: 8, role: "stratigraphic" }), false);
  assert.ok(planeMisfitM(flat) < 3);
  assert.equal(looksLikeFlatPile({ dip: planeDipDeg(flat), misfit: planeMisfitM(flat), medianRunM: 2, role: "stratigraphic" }), true, "WA iron's interbeds (#2927) still read as a pile");
  assert.equal(looksLikeFlatPile({ dip: planeDipDeg(flat), misfit: planeMisfitM(flat), medianRunM: 2, role: "intrusion" }), false, "an intrusion role never");
  assert.equal(looksLikeFlatPile({ dip: planeDipDeg(flat), misfit: planeMisfitM(flat), medianRunM: 2, role: "dyke" }), false);
  assert.equal(looksLikeFlatPile({ dip: 40, misfit: 1, medianRunM: 2, role: "stratigraphic" }), false, "steep");
});

test("#3262 the model check's other side: the metres of other rock the model puts in the unit", () => {
  const block = { extent: [0, 10, 0, 10, 0, 10], resolution: [1, 1, 2], ids: new Uint8Array([1, 2]), labels: ["i9", null] }; // lower half i9 (id 1), upper above tops (id 2)
  const samples = [{ x: 5, y: 5, z: 2, metres: 485, logged: "i9" }, { x: 5, y: 5, z: 8, metres: 425, logged: "i9" }]; // 485 of 910 in i9
  const others = [{ x: 5, y: 5, z: 3, metres: 2297 }, { x: 5, y: 5, z: 7, metres: 3157 }, { x: 50, y: 5, z: 3, metres: 99 }]; // the last: outside
  const t = modelledAsTally(block, samples, others);
  assert.equal(t.otherTotal, 5454);
  assert.equal(t.otherIn, 2297);
  assert.deepEqual(t.units, [{ unit: "i9", called: 2782, loggedAs: 485, otherIn: 2297 }]);
  assert.equal(Math.round((100 * 485) / 2782), 17, "Galore's 17 %");
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /const pile = looksLikeFlatPile\(\{ dip, misfit: planeMisfitM\(\[\.\.\.first\.values\(\)\]\), medianRunM: /);
  assert.match(src, /const ib = pile && unitVals \? interbeds\(/);
  assert.match(src, /Model check, the other side: the model also puts \{m\} of the \{total\} logged metres of other rock inside the modelled units/);
});
