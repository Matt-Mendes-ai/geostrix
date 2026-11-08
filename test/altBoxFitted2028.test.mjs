// TASKS.csv #2028 (review #2013, Geochem) — AI / CCPI for intrusion-hosted rocks: a least-altered box fitted to the project's own
// least-altered samples (no invented intrusive box, #264); the AI-up trend named phyllic or potassic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyAlterationBox, fitLeastAlteredBox, FITTED_PROTOLITH, GEOCHEM_LABELS, GEOCHEM_METHODS, DIAGRAMS } from "../src/lib/geochemDiagrams.js";
const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const m = readFileSync(new URL("../src/components/AlterationBoxModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the fitted box is the 5th-95th percentile of the samples, and needs 5", () => {
  const pts = Array.from({ length: 21 }, (_, i) => ({ ai: 30 + i, ccpi: 50 + i }));
  assert.deepEqual(fitLeastAlteredBox(pts), { ai: [31, 49], ccpi: [51, 69], n: 21 });
  assert.equal(fitLeastAlteredBox(pts.slice(0, 4)), null);
  assert.equal(classifyAlterationBox(40, 60, FITTED_PROTOLITH, { [FITTED_PROTOLITH]: fitLeastAlteredBox(pts) }), "LA-FIT");
});
test("AI up keeps one name that says phyllic or potassic (a K/Al split at 2/3 called Woodjam's potassic rock phyllic)", () => {
  assert.equal(classifyAlterationBox(80, 50, "andesite"), "SER");
  assert.match(GEOCHEM_LABELS.SER, /phyllic or potassic/);
  assert.equal(classifyAlterationBox(80, 90, "andesite"), "CHL");
  const s = { values: { Na: 2.5, K: 3.0, Mg: 3.5, Ca: 0.5, Fe: 4, Al: 8 } }, u = { Na: "%", K: "%", Mg: "%", Ca: "%", Fe: "%", Al: "%" };
  assert.ok(["SER", "CHL", "LA-AND", "CARB", "LOWCCPI", "ALB", "EPI"].includes(GEOCHEM_METHODS.alteration_boxplot.classify(s.values, u, s, { protolith: "andesite" })));
});
test("the caption no longer calls the plot the standard for every deposit; the dialog and run are wired", () => {
  assert.doesNotMatch(DIAGRAMS.boxplot.caption, /Standard for VMS\/epithermal/);
  assert.match(DIAGRAMS.boxplot.caption, /the Molar K\/Al vs Na\/Al diagram tells them apart/);
  assert.match(m, /<option value=\{FITTED_PROTOLITH\} disabled=\{!altCodes\.length\}>/);
  assert.match(m, /onRun\(\{ boxes, map, source, fitCodes \}\)/);
  assert.match(g, /fitted = fitLeastAlteredBox\(pts\);/);
  assert.match(g, /altCodes=\{\[\.\.\.new Set\(\(layers\.alt \|\| \[\]\)/);
});
test("every class the box plot gives has a label (a comment once swallowed CHL / EPI)", () => {
  for (const k of ["SER", "CHL", "EPI", "CARB", "ALB", "LOWCCPI", "LA-AND", "LA-FIT"]) assert.ok(GEOCHEM_LABELS[k], k);
});
