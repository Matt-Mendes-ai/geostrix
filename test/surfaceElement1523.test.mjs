// TASKS.csv #1523 — the surface-sample tools opened on S (%) because Lawyers' surface elements are stored S, V, Au, Ag ...; Grade stats
// dropped Au when its data source switched to surface samples
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preferredElement } from "../src/lib/preferredElement.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("preferredElement skips S and V for the first commodity", () => {
  assert.equal(preferredElement(["S", "V", "Au", "Ag", "Al"]), "Au");
  assert.equal(preferredElement(["S", "V", "Al"]), "S"); // no commodity: the first, as before
});

test("Thresholds, Level surveys and Surface QAQC open on the commodity", () => {
  assert.match(read("../src/components/ThresholdToolkit.jsx"), /useState\(\(\) => preferredElement\(surfaceElements\.map\(\(e\) => e\.symbol\)\)\)/);
  assert.match(read("../src/components/LevellingPanel.jsx"), /useState\(\(\) => preferredElement\(elements\.map\(\(e\) => e\.symbol\)\)\)/);
  assert.match(read("../src/components/SurfaceQaqcPanel.jsx"), /useState\(\(\) => preferredElement\(elementList\)\)/);
});

test("Grade stats keeps the element across a data-source switch when the other source has it", () => {
  assert.match(read("../src/components/GradeStatistics.jsx"), /setSymbolRaw\(els\.some\(\(e\) => e\.symbol === symbol\) \? symbol : preferredElement\(els\.map\(\(e\) => e\.symbol\)\)\);/);
});
