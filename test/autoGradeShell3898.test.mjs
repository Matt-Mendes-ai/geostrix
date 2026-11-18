// TASKS.csv #3898 — "Build it for me": the grade shell's cut-off from the grade distribution and its cell size from the drilling
// (src/lib/auto/autoGradeShell.js). Synthetic holes and grades, from a seeded generator.
import test from "node:test";
import assert from "node:assert/strict";
import { autoGradeShell, bestSplit, CLEAR_VALLEY } from "../src/lib/auto/autoGradeShell.js";

function project({ zone = true, nx = 6, spacing = 40, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const collars = [], samples = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nx; j++) {
    const hole_id = `G${i}-${j}`, x = i * spacing, y = j * spacing;
    collars.push({ hole_id, x, y, z: 0 });
    for (let d = 0; d < 80; d += 2) {
      const inZone = zone && d > 30 && d < 50 && i > 1 && i < 5; // a mineralized slab in the middle holes; background elsewhere
      samples.push({ hole_id, x, y, z: -d, from: d, to: d + 2, value: 10 ** (inZone ? 0.3 + 0.25 * gauss() : -1.3 + 0.3 * gauss()) });
    }
  }
  return { collars, samples };
}

test("two populations: the cut-off falls between them, from the data alone", () => {
  const r = autoGradeShell({ ...project(), unit: "g/t" });
  assert.equal(r.ok, true);
  assert.ok(r.values.cutoff > 0.1 && r.values.cutoff < 1, String(r.values.cutoff)); // between the background (~0.05) and the zone (~2)
  assert.ok(r.values.shareAbove > 0.08 && r.values.shareAbove < 0.2);
  assert.equal(r.values.cellSize, 10); // a quarter of 40 m
  assert.match(r.reasons[0].text, /^Cut-off 0\.\d+ g\/t: where these grades split best/);
  assert.deepEqual(r.notes, []);
  // the same holes with grades ten times higher: the cut-off moves with them (no "usual" cut-off for a metal)
  const p = project(); p.samples.forEach((x) => { x.value *= 10; });
  assert.ok(Math.abs(autoGradeShell(p).values.cutoff / r.values.cutoff - 10) < 1.5);
});

test("one population: the best split is given with a note that it is not a natural one", () => {
  const r = autoGradeShell({ ...project({ zone: false }), unit: "%" });
  assert.equal(r.ok, true);
  assert.match(r.notes[0], /do not split clearly/);
  // the valley test: one normal curve and a flat spread have no valley; a small group well apart has one, and the cut sits in it
  let k = 11; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const ones = (a) => a.map(() => 1), mk = (f) => Array.from({ length: 4000 }, f);
  const normal = mk(g), flat = mk((_, i) => i / 4000), twoGroups = mk(() => (rnd() < 0.05 ? 3 + 0.5 * g() : 0.5 * g()));
  assert.equal(bestSplit(normal, ones(normal)).clear, false);
  assert.equal(bestSplit(flat, ones(flat)).clear, false);
  const t = bestSplit(twoGroups, ones(twoGroups));
  assert.ok(t.clear && t.valley < CLEAR_VALLEY && t.cut > 1 && t.cut < 2.2, JSON.stringify(t)); // in the gap, not in the background's tail
});

test("the data cannot support it: too few holes or samples, or grades all alike", () => {
  const p = project(); const two = p.samples.filter((s) => s.hole_id === "G0-0" || s.hole_id === "G0-1");
  const r = autoGradeShell({ collars: p.collars, samples: two });
  assert.equal(r.ok, false);
  assert.match(r.verdict[0], /^Grades in only 2 holes/);
  assert.match(autoGradeShell({ samples: p.samples.slice(0, 10) }).verdict.join(" "), /Grades in only one hole.*Only 10 samples/);
  const same = p.samples.map((s) => ({ ...s, value: 1 }));
  assert.match(autoGradeShell({ samples: same }).verdict[0], /All the grades are the same/);
  assert.equal(autoGradeShell({ samples: same }).values, null);
});
