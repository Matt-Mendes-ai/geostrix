// TASKS.csv #3554 / #3555 / #3561 / #3570 / #3571 / #3572 (Fireweed rehearsal, Macpass) — the 3D View's hole filter reads numbers and what a hole has,
// a hole filter is said over the view and framed on, the fence series follows the holes shown, a zoomed-to hole is marked, a retyped class limit
// carries its generated label, and a click on a trace lists the collar's fields. Counts re-derived from the shipped Macpass CSVs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { holesForFilter, holeSetsOf, parseFilterTerms, collarNumber, hiddenHoleCount, fenceTracesOf } from "../src/lib/holeFilter.js";
import { relabelAfterLimit, isGeneratedLabel } from "../src/lib/classLabels.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const table = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const collars = table("collars.csv").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length, attrs: { year: r.year, property: r.property, prospect: r.prospect, hole_type: r.hole_type, "hole type": r.hole_type } }));
const assays = table("assays.csv").map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to }));
const sets = holeSetsOf(assays, { litho: [], sg: table("sg.csv").map((r) => ({ hole_id: r.hole_id })) });
const ids = (f) => holesForFilter(collars, f, { holeSets: sets }).holes;

test("a number test: year>=2017 lists the holes drilled from 2017 on (188 of 559), year=2017..2023 and a pair of tests agree", () => {
  const truth = collars.filter((c) => +c.attrs.year >= 2017).length;
  assert.equal(truth, 188, "the rehearsal's Python count");
  assert.equal(ids("year>=2017").length, 188);
  assert.equal(ids("year>2016").length, 188);
  assert.equal(ids("year=2017..2023").length, 188);
  assert.equal(ids("year>=2017 year<=2019").length, collars.filter((c) => +c.attrs.year >= 2017 && +c.attrs.year <= 2019).length);
  assert.equal(ids("length>300").length, collars.filter((c) => c.length > 300).length);
  assert.ok(ids("length>300").length > 0);
});

test("a number test joins the other terms: prospect=Tom_West year>=2017 is the holes with both", () => {
  const n = collars.filter((c) => c.attrs.prospect === "Tom West" && +c.attrs.year >= 2017).length;
  assert.equal(ids("prospect=Tom_West year>=2017").length, n);
  assert.ok(n > 0 && n < 143);
});

test("has:assays / no:assays: 432 holes have assays and the 127 others none; a layer by its name", () => {
  assert.equal(ids("has:assays").length, 432);
  assert.equal(ids("no:assays").length, 127);
  assert.equal(ids("has:sg").length, 431);
  assert.equal(ids("no:assays year>=2017").length, collars.filter((c) => +c.attrs.year >= 2017 && !sets.assays.has(c.hole_id)).length);
  assert.equal(ids("TU has:assays").length, collars.filter((c) => /tu/i.test(c.hole_id) && sets.assays.has(c.hole_id)).length);
});

test("what the box cannot read lists nothing and says what it knows: an unknown set names itself", () => {
  const r = holesForFilter(collars, "has:nothing", { holeSets: sets });
  assert.equal(r.holes.length, 0);
  assert.deepEqual(r.hint, { kind: "set", names: ["nothing"] });
  assert.equal(ids("year>=abc").length, 0, "no number: it is read as a hole id");
  const src = read("../src/modules/viewer/HoleFilterBar.jsx");
  assert.match(src, /No hole matches\. The box reads part of a hole id, field=value, a number test such as year>=2017, length>300 or year=2017\.\.2023, and has:assays or no:assays\./);
  assert.match(src, /No data called \{name\} here: has:assays, no:assays, or the name of a layer of this project\./);
  assert.match(src, /By what holes have…/);
});

test("the terms are read once and the old rules are untouched: plain ids, field=value and the text fallback", () => {
  assert.deepEqual(parseFilterTerms("year>=2017 TU has:assays").rest, "TU");
  assert.equal(ids("prospect=Tom_West").length, 143);
  assert.equal(ids("hole_type=UDDH").length, 80);
  assert.equal(ids("").length, 559);
  assert.equal(collarNumber({ attrs: { Year: " 2019 " } }, "year"), 2019);
  assert.ok(Number.isNaN(collarNumber({ attrs: { year: "n/a" } }, "year")));
});

test("the view says how many holes are shown, and the fence series follows them (#3555, #3561)", () => {
  const visible = Object.fromEntries(collars.map((c) => [c.hole_id, c.attrs.prospect === "Tom West"]));
  assert.equal(hiddenHoleCount(collars, visible), 416);
  assert.equal(hiddenHoleCount(collars, {}), 0);
  const traces = collars.map((c) => ({ hole_id: c.hole_id, pts: [] }));
  assert.equal(fenceTracesOf(traces, visible).length, 143);
  assert.equal(fenceTracesOf(traces, {}), traces, "the same array when none is hidden");
  const note = read("../src/modules/viewer/HiddenHolesNote.jsx"), vm = read("../src/modules/ViewerModule.jsx");
  assert.match(note, /\{shown\} of \{total\} holes shown/);
  assert.match(vm, /<HiddenHolesNote collars=\{collars\} visibleHoles=\{visibleHoles\} setVisibleHoles=\{setVisibleHoles\} \/>/);
  assert.match(vm, /const shownT = fenceTracesOf\(tracesRef\.current, visibleHolesRef\.current\);/);
  assert.match(vm, /fenceLinesWithData\(pts, sliceSeriesAzimuth, width, shownT\)/);
  assert.match(vm, /useDrillLineDefaults\(shownCollars(, survey)?\)/);
  assert.match(vm, /fitView\(shown\.length && shown\.length < \(tracesRef\.current \|\| \[\]\)\.length \? shown : hole\)/, "#3555: the first view frames the holes shown");
  assert.match(read("../src/modules/viewer/FenceOptions.jsx"), /Over the \{shown\} of \{total\} holes shown\./);
});

test("Zoom to a hole marks it: yellow trace, its own label, removed after a few seconds (#3570)", () => {
  const vm = read("../src/modules/ViewerModule.jsx"), z = read("../src/modules/viewer/zoomMark.js");
  assert.match(vm, /markZoomedHole\(sceneRef\.current\?\.getObjectByName\("root"\), cameraRef\.current, mountRef\.current, t\);/);
  assert.match(z, /depthTest: false/);
  assert.match(z, /setTimeout\(done, ms\)/);
});

test("a generated class label follows a retyped limit, one the user typed stays (#3571)", () => {
  const b = [{ max: 0.3, label: "≤ 0.3" }, { max: 1, label: "0.3–1" }, { max: 3, label: "1–3" }, { max: 10, label: "3–10" }];
  const a0 = relabelAfterLimit(b, b.map((x, i) => (i === 0 ? { ...x, max: 2 } : x)), 0);
  assert.equal(a0[0].label, "≤ 2");
  assert.equal(a0[1].label, "2–1", "the class above follows its lower bound (the limits are retyped one by one)");
  const a1 = relabelAfterLimit(a0, a0.map((x, i) => (i === 1 ? { ...x, max: 5 } : x)), 1);
  assert.equal(a1[1].label, "2–5");
  assert.equal(a1[2].label, "5–3");
  const typed = [{ max: 0.3, label: "Low" }, { max: 1, label: "Ore" }, { max: 3, label: "" }];
  const t = relabelAfterLimit(typed, typed.map((x, i) => (i === 0 ? { ...x, max: 2 } : x)), 0);
  assert.equal(t[0].label, "Low");
  assert.equal(t[1].label, "Ore");
  assert.ok(isGeneratedLabel("< 0.5") && isGeneratedLabel("0.3–1") && isGeneratedLabel("≤ 1e-3") && !isGeneratedLabel("High") && !isGeneratedLabel("Very high"));
  assert.match(read("../src/components/AssayStyleModal.jsx"), /breaks = relabelAfterLimit\(local\.breaks, breaks, i\)/);
});

test("Identify on a bare trace lists the collar's own fields (#3572 (4))", () => {
  const id = read("../src/lib/viewer/identify.js");
  assert.match(id, /if \(hole && !row && o\.userData\?\.holeId\) \{ const cc = ctx\.collarOf\?\.\(hole\);/);
  assert.match(id, /collarOf: \(id\) => \(r\.collars \|\| \[\]\)\.find\(\(c\) => c\.hole_id === id\) \|\| null/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /useIdentify\(\{ collars, mountRef/);
});
