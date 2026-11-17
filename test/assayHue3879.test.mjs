// TASKS.csv #3879 — an element's default colour is its own, whatever else is switched on; a project saved with the old pick-order hues is repaired where the classes were
// GeoStrix's, never the user's. SYNTHETIC elements and ranges.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayHueIndex, assayHue, ASSAY_ELEMENT_COLORS, assayLegendGroups } from "../src/lib/legendGroups.js";
import { seedBreaks } from "../src/lib/colorRamp.js";
import { repairSeededHues } from "../src/lib/assayHueRepair.js";
import { elementClasses } from "../src/lib/viewer/modelLegendOnAdd.js";

const els = ["Zn", "Au", "Ag", "Pb", "Cu"].map((symbol) => ({ symbol, unit: "ppm" }));
const range = { min: 0, max: 100, p50: 2, p90: 20 };

test("each element has its own hue, from its place in the element list: the same whatever is switched on", () => {
  const hues = els.map((e) => assayHue(e.symbol, els));
  assert.equal(new Set(hues).size, 5, hues.join(" "));
  assert.deepEqual(els.map((e) => assayHueIndex(e.symbol, els)), [0, 1, 2, 3, 4]);
  assert.equal(assayHue("Pb", els), assayHue("Pb", els.slice()), "a function of the list, not of the pick order");
  const stray = assayHueIndex("Sn", els);
  assert.ok(stray >= 0 && stray < ASSAY_ELEMENT_COLORS.length && stray === assayHueIndex("Sn", els), "an element not in the list: a stable hash");
  assert.equal(assayHue("Zn", null), ASSAY_ELEMENT_COLORS[assayHueIndex("Zn", null)]);
});

test("the legend, the chips' default and a block model's classes read the same hue for an element", () => {
  const base = assayHue("Ag", els);
  const lg = assayLegendGroups({ assays: [{ hole_id: "H", from: 0, to: 1, values: { Ag: 1 } }], assayElements: els, assayVisible: true, assayDisplayElements: ["Ag", "Zn"], assayStyle: {} });
  assert.equal(lg.find((g) => g.key === "assay_Ag").items[0][1], base, "Ag first in the pick order, still its own hue");
  assert.equal(lg.find((g) => g.key === "assay_Zn").items[0][1], assayHue("Zn", els));
  const rows = Array.from({ length: 60 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, values: { Ag: i % 7 === 0 ? 50 : (i % 5) * 0.4 } }));
  const ec = elementClasses({}, "Ag", { rows, unit: "ppm", elements: els.map((e) => e.symbol) });
  assert.ok(ec && ec.breaks.every((b) => b.seedBase === base), "the model's classes are seeded from the chips' hue");
});

test("seeded classes record the colour they were seeded from; a user's classes carry no tag", () => {
  const b = seedBreaks(range, "#0072b2");
  assert.ok(b.length >= 3 && b.every((x) => x.seeded === true && x.seedBase === "#0072b2"));
});

// the old project: every element holds the amber ramp seeded when it was the first one on
const amber = (sym) => ({ breaks: seedBreaks(range, "#e69f00").map(({ seedBase, ...b }) => b) }); // no seedBase: saved before the tag
test("a saved project with the same amber on every element is repaired: each seeded ramp is re-seeded from its element's hue", () => {
  const saved = Object.fromEntries(els.map((e) => [e.symbol, amber(e.symbol)]));
  const fixed = repairSeededHues(saved, els, () => range);
  assert.notEqual(fixed, saved);
  const mid = (st) => st.breaks[Math.floor(st.breaks.length / 2)].color;
  assert.equal(new Set(els.map((e) => mid(fixed[e.symbol]))).size, 5, "five distinct class colours");
  for (const e of els) assert.ok(fixed[e.symbol].breaks.every((b) => b.seedBase === assayHue(e.symbol, els)));
  assert.equal(repairSeededHues(fixed, els, () => range), fixed, "idempotent: the same object once repaired");
});

test("never a colour or a class the user set", () => {
  const edited = { breaks: seedBreaks(range, "#e69f00").map((b, i) => (i === 1 ? { max: b.max, color: "#123456" } : b)) }; // one class edited: no seeded tag on it
  const chosen = { color: "#ff00aa", breaks: seedBreaks(range, "#ff00aa") };
  const none = { color: "#00ff00", sizeMult: 2 };
  const saved = { Zn: edited, Au: chosen, Ag: none, Pb: amber("Pb") };
  const fixed = repairSeededHues(saved, els, () => range);
  assert.equal(fixed.Zn, edited, "an edited class set stays");
  assert.equal(fixed.Au, chosen, "classes seeded from a colour the user chose stay");
  assert.equal(fixed.Ag, none);
  assert.notEqual(fixed.Pb, saved.Pb, "the untouched amber one is repaired");
  assert.equal(repairSeededHues(saved, els, () => null).Pb, saved.Pb, "no range for the element: left as it was");
  assert.equal(repairSeededHues(null, els, () => range), null);
});

test("wiring: the chips, the tubes, the legend, the sections and the modal take the element's own hue", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const baseColor = s\[symbol\]\?\.color \|\| ASSAY_ELEMENT_COLORS\[assayHueIndex\(symbol, assayElements\) % ASSAY_ELEMENT_COLORS\.length\];/);
  assert.match(v, /const defaultHue = ASSAY_ELEMENT_COLORS\[assayHueIndex\(e\.symbol, assayElements\) % ASSAY_ELEMENT_COLORS\.length\];/);
  assert.match(v, /const \{ hue: idx \} = specs\.find/); assert.match(v, /const \{ hue: idx, offX, offZ \} = specs\.find/);
  assert.match(v, /assayColor=\{\(sym, v\) => assayColorFor\(v, assayHueIndex\(sym, assayElements\), assayStyle\[sym\]\)\}/);
  assert.match(v, /defaultColor=\{ASSAY_ELEMENT_COLORS\[assayHueIndex\(assayStyleModalSymbol, assayElements\) % ASSAY_ELEMENT_COLORS\.length\]\}/);
  assert.match(v, /setAssayStyle\(\(p\) => repairSeededHues\(p, assayElements, assayRangeFor\)\)/);
  assert.ok(v.indexOf("const assayRangeFor = useCallback") < v.indexOf("repairSeededHues(p, assayElements, assayRangeFor)"), "the repair reads assayRangeFor after it is declared (a 'before initialization' error otherwise: the tab closed)");
});
