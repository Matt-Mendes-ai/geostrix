// TASKS.csv #3883 (#3830) — the surface samples on the Maps plan coloured or sized by an element or a field (a Zone), with their ids and a legend: the
// Collars panel's treatment for samples (lib/sampleMapStyle.js over collarMapStyle's colouring). SYNTHETIC samples.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleColourChoices, sampleColouring, sampleDotRadius } from "../src/lib/sampleMapStyle.js";

const zones = ["North", "South", "East"];
const samples = Array.from({ length: 30 }, (_, i) => ({ sample_id: `RK-${100 + i}`, x: 1000 + i * 10, y: 2000, medium: i % 2 ? "rock" : "soil", values: { Au: i < 28 ? i / 10 : undefined, Cu: i === 0 ? 5 : undefined }, attrs: { Zone: zones[i % 3] } }));
const elements = [{ symbol: "Au", unit: "g/t" }, { symbol: "Cu", unit: "ppm" }, { symbol: "Ag", unit: "g/t" }];

test("#3830 the choices: elements with values on two samples or more, then the samples' own fields (the Zone, the medium)", () => {
  const c = sampleColourChoices(samples, elements);
  assert.deepEqual(c.map((x) => x.key), ["el:Au", "f:medium", "f:Zone"]);
  assert.equal(c[0].kind, "number"); assert.equal(c[2].kind, "category");
});

test("#3830 coloured by an element: quintile classes, a class per sample, no value counted; by a field: a colour per value", () => {
  const au = sampleColouring(samples, "el:Au");
  assert.equal(au.kind, "number"); assert.equal(au.legend.length, 5); assert.equal(au.noValue, 2);
  assert.equal(au.colourOfIndex(29), null, "no Au: no colour (the plan draws a grey ring)");
  assert.equal(au.classOfIndex(0), 0); assert.equal(au.classOfIndex(27), 4);
  const z = sampleColouring(samples, "f:Zone");
  assert.equal(z.kind, "category");
  assert.deepEqual(z.legend.map((l) => l.label), ["East (10)", "North (10)", "South (10)"]);
  assert.equal(z.colourOfIndex(0), z.colourOfIndex(3), "the same Zone, the same colour");
  assert.notEqual(z.colourOfIndex(0), z.colourOfIndex(1));
  assert.equal(sampleColouring(samples, ""), null);
  assert.deepEqual([sampleDotRadius(-1, true), sampleDotRadius(0, true), sampleDotRadius(4, true), sampleDotRadius(4, false)], [2.5, 2, 6.8, 2.5]);
});

test("#3830 the plan: the choice, size and ids kept for the session; drawn with a grey ring for no value; ids decluttered; a legend", () => {
  const m = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const k of ["sampleBy", "sampleSized", "sampleIds"]) assert.ok(m.includes(`useKept(scope, "${k}", `), k);
  assert.match(m, /const col = sampleCol \? sampleCol\.colourOfIndex\(i\) : colorForMedium\(s\.medium\)/);
  assert.match(m, /for \(const \{ i \} of declutterLabels\(sampleLabels, 64, 12\)\)/);
  assert.match(m, /<div aria-label=\{tr\("Sample legend"\)\}/);
  assert.match(m, /sampleCol, sampleSized, sampleIds \/\* #3883 \(#3830\) \*\//, "the plan redraws when they change");
});
