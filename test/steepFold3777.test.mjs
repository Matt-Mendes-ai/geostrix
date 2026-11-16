// TASKS.csv #3777 — on a steep deposit the checks kept layer-cake wording: the pick check called the clashing picks 'usually interbeds of neighbouring
// units in a flat pile', and Check relationships counted every steep surface as a fold-back (two elevations at one location is what a steep, wavy
// contact looks like), five times over with the same paragraph. Now: a steep surface (mean dip 60° or more) is not tested and is named; each surface is
// one short line and the reading of a fold-back is said once, leading with 'a unit that is not one layer'; the pick check no longer says 'usually'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkTopology, meshMeanDipDeg, inversionCheck, STEEP_DIP_DEG, FOLD_EXPLAIN, FOLD_CONTACT_TYPES } from "../src/lib/topology.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// y up. A Z-fold lying flat (as the #2058 test), and the same sheet stood on edge (x <-> y swapped: it dips 90° and is multivalued wherever it waves)
function zfold(steep) {
  const xs = [0, 60, 40, 100], ys = [0, 0, -10, -10], pos = [], idx = [];
  xs.forEach((x, i) => { pos.push(...(steep ? [ys[i], x, 0, ys[i], x, 100] : [x, ys[i], 0, x, ys[i], 100])); });
  for (let i = 0; i + 1 < xs.length; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}
function ramp(dipDeg) { // a plane dipping dipDeg about the z axis, 100 m across
  const r = (dipDeg * Math.PI) / 180, pos = [0, 0, 0, 0, 0, 100, 100 * Math.cos(r), -100 * Math.sin(r), 0, 100 * Math.cos(r), -100 * Math.sin(r), 100];
  return { positions: Float32Array.from(pos), indices: Uint32Array.from([0, 2, 1, 1, 2, 3]) };
}

test("the mean dip: flat 0, vertical 90, a 45° ramp 45; the steep threshold is 60", () => {
  assert.ok(Math.abs(meshMeanDipDeg(ramp(0).positions, ramp(0).indices)) < 0.01);
  assert.ok(Math.abs(meshMeanDipDeg(ramp(45).positions, ramp(45).indices) - 45) < 0.01);
  assert.ok(Math.abs(meshMeanDipDeg(ramp(80).positions, ramp(80).indices) - 80) < 0.01);
  assert.equal(meshMeanDipDeg([], []), null);
  assert.equal(STEEP_DIP_DEG, 60);
});

test("Check relationships: a flat Z-fold is still caught; the same fold stood on edge is named as steep, not counted", () => {
  const flat = checkTopology([{ id: "a", name: "Top of VANSS", type: "stratigraphic_contact", ...zfold(false) }], { up: "y" });
  assert.ok(flat.violations.some((v) => v.kind === "inverted")); assert.deepEqual(flat.steep, []);
  const steep = checkTopology([{ id: "b", name: "Top of AND", type: "stratigraphic_contact", ...zfold(true) }], { up: "y" });
  assert.equal(steep.violations.filter((v) => v.kind === "inverted").length, 0);
  assert.equal(steep.steep.length, 1); assert.equal(steep.steep[0].name, "Top of AND"); assert.ok(steep.steep[0].dip >= 60);
  assert.equal(steep.checked, 1); // it was a check, not a skipped one: 'nothing to check' is not the message
  assert.ok(inversionCheck({ ...zfold(true) }, { up: "y" }).folded >= 0); // the primitive itself is as it was
  assert.ok(FOLD_CONTACT_TYPES.has("stratigraphic_contact"));
});

test("a surface's line is short; the reading is one text that leads with the unit that is not one layer", () => {
  const r = checkTopology([{ id: "a", name: "Top of VANSS", type: "stratigraphic_contact", ...zfold(false) }], { up: "y" });
  const m = r.violations.find((v) => v.kind === "inverted").message;
  assert.match(m, /^"Top of VANSS" folds back over itself at \d+ of \d+ sampled locations\.$/);
  assert.match(FOLD_EXPLAIN, /^Folding back means two elevations at one location: a unit that is not one layer/);
  assert.ok(FOLD_EXPLAIN.indexOf("not one layer") < FOLD_EXPLAIN.indexOf("Layer-cake"));
});

test("wired: the toast says it once and names the steep surfaces; the run's notice too; the pick check does not say 'usually'", () => {
  const u = read("../src/modules/viewer/useSurfaceChecks.js"), r = read("../src/modules/viewer/modellingRuns.js");
  assert.match(u, /const foldWhy = res\.violations\.some\(\(v\) => v\.kind === "inverted"\) \? " " \+ tr\(FOLD_EXPLAIN\) : "";/);
  assert.match(u, /\+ foldWhy \+ steepNote\)/);
  assert.match(r, /dipDeg != null && dipDeg >= STEEP_DIP_DEG \? \{ sampled: 0 \}/);
  assert.match(r, /why: tr\(FOLD_EXPLAIN\)/);
  assert.doesNotMatch(r, /usually interbeds of neighbouring units in a flat pile/);
  assert.match(r, /a unit that is not one layer \(a steep body or stacked sheets/);
  for (const k of [
    '"{name}" folds back over itself at {folded} of {sampled} sampled locations.',
    FOLD_EXPLAIN,
    "Not tested for fold-back ({list}: they dip over {deg}° on average, and a steep contact has two elevations at one location).",
    "{list} {why} Check relationships lists it again with the other checks.",
  ]) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
