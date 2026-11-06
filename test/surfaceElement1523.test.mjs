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
  assert.match(read("../src/components/ThresholdToolkit.jsx"), /useState\(\(\) => preferredElement\(surfaceElements\.map\(\(e\) => e\.symbol\), null, lead\)\)/);
  assert.match(read("../src/components/LevellingPanel.jsx"), /useState\(\(\) => preferredElement\(elements\.map\(\(e\) => e\.symbol\), null, lead\)\)/);
  assert.match(read("../src/components/SurfaceQaqcPanel.jsx"), /useState\(\(\) => preferredElement\(elementList, null, lead\)\)/);
});

test("Grade stats keeps the element across a data-source switch when the other source has it", () => {
  assert.match(read("../src/components/GradeStatistics.jsx"), /setSymbolRaw\(els\.some\(\(e\) => e\.symbol === symbol\) \? symbol : preferredElement\(els\.map\(\(e\) => e\.symbol\), null, lead\)\);/);
});

// Matt, 2026-11-06: on an Au-Ag project the tools open on Au — the project's lead commodity from its own analyses
import { leadCommodity, MINERALIZED_PPM } from "../src/lib/preferredElement.js";
import { silvertipAssays } from "../src/lib/sampleSilvertip.js";
import { valueIn } from "../src/lib/geochem.js";

test("leadCommodity: the commodity most often at a mineralized grade; preferredElement takes it first", () => {
  const ppm = (s, sym) => s.values[sym];
  const auAg = Array.from({ length: 100 }, (_, i) => ({ values: { Cu: 20 + i, Au: i < 30 ? 1.5 : 0.01, Ag: i < 10 ? 20 : 1 } }));
  assert.equal(leadCommodity(auAg, ppm), "Au");
  const porphyry = Array.from({ length: 100 }, (_, i) => ({ values: { Cu: i < 60 ? 3000 : 400, Au: i < 20 ? 0.2 : 0.02 } }));
  assert.equal(leadCommodity(porphyry, ppm), "Cu");
  assert.equal(leadCommodity([{ values: { Cu: 5 } }], ppm), null);
  assert.equal(preferredElement(["S", "Cu", "Au"], null, "Au"), "Au");
  assert.equal(preferredElement(["S", "Cu"], null, "Au"), "Cu"); // the lead is not in this list: the fixed order
  assert.ok(MINERALIZED_PPM.Au === 0.1 && MINERALIZED_PPM.Cu === 1000);
});

test("the bundled Silvertip assays lead with a base or precious metal of the CRD, not Cu", () => {
  const { rows, elements } = silvertipAssays(readFileSync(new URL("../sample_data/silvertip/assays.csv", import.meta.url), "utf8"));
  const units = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  assert.ok(["Zn", "Pb", "Ag"].includes(leadCommodity(rows, (s, sym) => valueIn(s, sym, "ppm", units))));
});

test("every tool that picks an opening element passes the lead", () => {
  for (const f of ["BestIntercepts", "CompositingModal", "GradeStatistics", "ThresholdToolkit", "LevellingPanel", "SurfaceQaqcPanel"]) {
    const s = read(`../src/components/${f}.jsx`);
    assert.match(s, /const lead = useLeadCommodity\(\);/, f);
  }
});
