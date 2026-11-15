// TASKS.csv #3654 (Fireweed re-test R1, Macpass) — wording left after the ground fixes: (1) 'between the 559 collars' while the ground was the
// 479 surface collars'; (2) 'Keep the lowest (the latest pit floor)' on mine levels and a hillside; (3) '(a pit or benches?)' for surface holes on
// 25-29° slopes; (4) the share 'beyond the drilling' against the 15 m between collar sites beside a search from the 24 m between samples;
// (5) '~2.5 min' for a 5,000,000-block run of 29-58 s, and window pauses at the end that moved to the worker (#3580 (b)).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelGround } from "../src/lib/modelGround.js";
import { gradeShellBudgetNote } from "../src/lib/estimationMeta.js";
import { collarLevelsText } from "../src/lib/collarLevelsText.js";

const csv = (f) => { const [h, ...rows] = readFileSync(new URL(`../sample_data/yk_macpass/${f}`, import.meta.url), "utf8").trim().split(/\r?\n/); const k = h.split(","); return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [k[i], v]))); };
const collars = csv("collars.csv").map((c) => ({ hole_id: c.hole_id, x: +c.x, y: +c.y, z: +c.z, attrs: { hole_type: c.hole_type } }));
const survey = csv("survey.csv").map((s) => ({ hole_id: s.hole_id, depth: +s.depth, azimuth: +s.azimuth, dip: -+s.dip }));

test("(1) the collar ground counts the collars it is built from: Macpass's 479 surface collars, not 559", () => {
  const g = modelGround(null, collars, survey);
  assert.equal(g.kind, "collars");
  assert.equal(g.collars, 479);
});

test("(3) the bench check names steep ground first", () => {
  const tw = collars.filter((c) => /^(TS|TU|TYK)/.test(c.hole_id));
  const t = collarLevelsText(tw, survey) || "";
  assert.doesNotMatch(t, /a pit or benches/);
  assert.match(t, /\(steep ground, benches or a pit\?\)/);
});

test("(5) the budget labels: 5 million about a minute, no window pause promised", () => {
  assert.equal(gradeShellBudgetNote(5e6), "~1 min, ~65 MB of memory");
  for (const b of [10e6, 20e6, 50e6]) assert.doesNotMatch(gradeShellBudgetNote(b), /window/);
});

test("(2) and (4): the stack choices, the beyond-drilling spacing; the keys in every language", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /<option value="lowest">\{tr\("Keep the lowest"\)\}<\/option>/);
  assert.match(g, /<option value="highest">\{tr\("Keep the highest"\)\}<\/option>/);
  assert.doesNotMatch(g, /the latest pit floor\)"\)/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const gsSpacing = gsSampleSpacing > 0 \? gsSampleSpacing : /);
  assert.match(r, /spacingAt: gsSampleSpacing > 0 \? "samples" : "collars"/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Keep the lowest", "Keep the highest", "~1 min, ~65 MB of memory", "up to ~5 min, ~0.25 GB of memory"]) assert.ok(j[k], `${l}: ${k}`);
    assert.ok(Object.keys(j).some((k) => k.includes("(steep ground, benches or a pit?)")), l);
    assert.ok(!Object.keys(j).some((k) => k.includes("(a pit or benches?)")), l);
  }
});
