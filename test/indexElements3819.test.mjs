// TASKS.csv #3819 (Scottie Gold review) — 'Orogenic Au index' on a project with only gold was the Au robust z under another name: the card now says what it was
// built from, an index with fewer than two elements is not offered and not computed, and an element with no spread is named. Synthetic samples.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sampleValues, indexRecipe, indexReport, indexNote } from "../src/lib/evidence.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tr = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const samples = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 0, medium: "soil", values: { Au: 0.01 * (1 + i), As: 5 + (i % 7) * 3, Ag: 0.5 } })); // Ag: one number
const withEls = (...e) => Object.fromEntries(e.map((x) => [x, "ppm"]));

test("the recipe lists what the project has and lacks", () => {
  const r = indexRecipe("orogenic", withEls("Au"));
  assert.deepEqual(r.present, ["Au"]);
  assert.ok(r.missing.includes("As") && r.missing.length === r.all.length - 1);
});

test("one element is not an index: every sample is empty; two give a mean of their z", () => {
  const one = sampleValues(samples, { kind: "index", preset: "orogenic" }, withEls("Au"));
  assert.ok(one.every((p) => Number.isNaN(p.value)));
  const two = sampleValues(samples, { kind: "index", preset: "orogenic" }, withEls("Au", "As"));
  assert.ok(two.some((p) => Number.isFinite(p.value)));
});

test("an element whose values are one number has no robust z: named as flat, and left out", () => {
  const rep = indexReport(samples, "epithermal", withEls("Au", "As", "Ag"));
  assert.deepEqual(rep.flat, ["Ag"]);
  assert.deepEqual(rep.used, ["Au", "As"]);
  const note = indexNote(rep, tr);
  assert.match(note, /From 2 of 8 elements: Au, As\./);
  assert.match(note, /Not assayed: .*Sb/);
  assert.match(note, /No spread \(more than half of the Ag values are one number/);
  assert.match(indexNote(indexReport(samples, "orogenic", withEls("Au")), tr), /Needs two or more elements with a spread; this project has Au of 6\./);
});

test("wiring: the add list offers an index only with two elements and counts them; the card and the empty message say why", () => {
  const e = read("../src/components/EvidenceOverlayPane.jsx");
  assert.match(e, /r\.present\.length >= 2\) out\.push/);
  assert.match(e, /index \(\{k\} of \{n\} elements\)/);
  assert.match(e, /indexNotes\[l\.ref\]/);
  assert.match(e, /indexNote\(indexReport\(surfaceSamples, src\.ref, units\), tr\)/);
  for (const l of ["es", "pt", "fr", "ar"]) for (const k of ["Samples: {name} index ({k} of {n} elements)", "Not assayed: {list}."]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))[k], `${l} ${k}`);
});
