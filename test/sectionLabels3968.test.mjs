// TASKS.csv #3968 (Matt: "This is very crowded. We need a way to turn off the various labels on a cross section.") — a Labels menu turns each kind
// of section label on or off, saved with the section's labels; over 30 holes in the buffer, offsets and depth ticks start off; the 'left out: no
// room' count counts only the kinds that are on. Made-up values only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LABEL_KINDS, CROWDED_HOLES, labelShow, floatLabelKind, labelsPatch, labelsPatchAll, crowdedDefault } from "../src/lib/sectionLabelKinds.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the defaults: everything, but offsets and depth ticks on a crowded section; the section's own choice wins", () => {
  assert.equal(CROWDED_HOLES, 30);
  assert.deepEqual(labelShow({ mode: "collar" }, 12), { eoh: true, ticks: true, offsets: true, grades: true, surfaces: true, ground: true, ids: true });
  assert.deepEqual(labelShow({ mode: "collar" }, 91), { eoh: true, ticks: false, offsets: false, grades: true, surfaces: true, ground: true, ids: true });
  assert.equal(crowdedDefault({ mode: "collar" }, 91), true, "said beside the menu");
  assert.equal(crowdedDefault({ mode: "collar" }, 30), false);
  const chosen = { mode: "collar", show: { ticks: true, offsets: false, eoh: false, grades: true, surfaces: true, ground: false } };
  assert.equal(crowdedDefault(chosen, 91), false, "a choice made: no note");
  assert.deepEqual(labelShow(chosen, 91), { eoh: false, ticks: true, offsets: false, grades: true, surfaces: true, ground: false, ids: true });
  assert.equal(labelShow({ mode: "off" }, 5).ids, false, "hole IDs follow the Hole labels position (Off)");
  assert.equal(labelShow(undefined, 5).ids, true);
});

test("turning a kind on or off: one patch saved with the section; hole IDs keep the position chosen before", () => {
  assert.deepEqual(labelsPatch({ mode: "collar" }, 91, "ticks", true), { show: { eoh: true, ticks: true, offsets: false, grades: true, surfaces: true, ground: true } });
  assert.deepEqual(labelsPatch({ mode: "both" }, 5, "ids", false), { mode: "off", lastMode: "both" });
  assert.deepEqual(labelsPatch({ mode: "off", lastMode: "both" }, 5, "ids", true), { mode: "both" });
  assert.deepEqual(labelsPatch({ mode: "off" }, 5, "ids", true), { mode: "collar" });
  assert.deepEqual(labelsPatchAll({ mode: "end" }, false), { show: { eoh: false, ticks: false, offsets: false, grades: false, surfaces: false, ground: false }, mode: "off", lastMode: "end" });
  assert.deepEqual(labelsPatchAll({ mode: "off", lastMode: "end" }, true), { show: { eoh: true, ticks: true, offsets: true, grades: true, surfaces: true, ground: true }, mode: "end" });
  assert.deepEqual(LABEL_KINDS.map(([k]) => k), ["ids", "eoh", "ticks", "offsets", "grades", "surfaces", "ground"]);
});

test("each label the collision pass places has its kind", () => {
  const kinds = { dm0_100: "ticks", pm1_200: "ticks", eoh3: "eoh", peoh2: "eoh", "off4": "offsets", "snapc1_2": "offsets", grade_7: "grades", bi_2: "grades", sf9: "surfaces", pp1_x: "surfaces" };
  for (const [k, v] of Object.entries(kinds)) assert.equal(floatLabelKind(k), v, k);
  assert.equal(floatLabelKind("something_else"), null, "anything else is always drawn");
  // every float label key the section pushes is one of these prefixes
  const w = read("../src/components/SectionWindow.jsx");
  const keys = [...w.matchAll(/floatLabels\.push\(\{ key: `([a-z_]+)/g)].map((m) => m[1]);
  assert.ok(keys.length >= 9, keys.join(","));
  for (const k of keys) assert.notEqual(floatLabelKind(`${k}1`), null, `${k}: a kind for every label key`);
});

test("wired in the section window: the menu, the note, the drawing and the left-out count", () => {
  const w = read("../src/components/SectionWindow.jsx");
  assert.match(w, /<details data-section-labels="" /);
  assert.match(w, /LABEL_KINDS\.map\(\(\[k, name\]\) => <label key=\{k\}/);
  assert.match(w, /onClick=\{\(\) => changeLabels\(labelsPatchAll\(labels, true\)\)\}/);
  assert.match(w, /crowdedDefault\(labels, holeCount\) && <span[^>]*>\{tr\("\{n\} holes: offsets and depth ticks off\.", \{ n: holeCount \}\)\}/);
  assert.match(w, /const show = labelShow\(labels, \(data\.holes \|\| \[\]\)\.length\);/);
  assert.match(w, /for \(let md = 50; show\.ticks && md < eoh - 5; md \+= 50\)/);
  assert.match(w, /\{show\.ground && <>\{haloBox\(groundLabel, /);
  assert.match(w, /const shown = floatLabels\.filter\(\(l\) => \{ const k = floatLabelKind\(l\.key\); return !k \|\| show\[k\]; \}\)/);
  assert.match(w, /leftOutRef\.current \+= shown\.filter\(\(l\) => l\.optional\)\.length - rl\.filter/, "left out: only the kinds that are on");
  // saved with the section: changeLabels relays the whole labels object, and a re-opened section takes it back as it was
  assert.match(w, /if \(data\?\.id\) sendSectionContacts\(\{ id: data\.id, labels: next \}\);/);
  assert.match(w, /setLabels\(d\.labels \? \{ mode: "collar", leaders: "auto", \.\.\.d\.labels, offsets: d\.labels\.offsets \|\| \{\} \}/);
});
