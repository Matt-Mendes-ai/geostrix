// TASKS.csv #2629 (split from #2350, review #2325 WA uranium) — two lab methods of one element are kept on the row and compared in QAQC >
// Method pairs; a lab repeat of one method pairs with the original's result by that method
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { methodPairs, methodSuffix, originalMethodValue, duplicatePairs } from "../src/lib/qaqc.js";
import { mergeAssayRows, removeAssayElement } from "../src/lib/geochem.js";

// 41 core samples with U and U_103 (U_103 about 6 % higher); one censored U; one standard that must not count
const rows = [];
for (let i = 0; i < 41; i++) rows.push({ hole_id: "NND001", from: i, to: i + 1, sample_id: `S${i}`, values: { U: 100 + i * 10 }, methodValues: { U: { U_103: (100 + i * 10) * 1.06 } } });
rows.push({ hole_id: "NND001", from: 41, to: 42, sample_id: "S41", values: { U: 0.5 }, qualifiers: { U: "<" }, methodValues: { U: { U_103: 3 } } });
rows.push({ hole_id: "OREAS-25a", from: 0, to: 0, sample_id: "STD1", sample_type: "standard", values: { U: 50 }, methodValues: { U: { U_103: 90 } } });
rows.push({ hole_id: "NND002", from: 0, to: 1, sample_id: "T0", values: { V: 40 }, methodValues: { V: { V_101: 71.2 } } });

test("each method column is paired with the element's value: count, median RPD and the bias as a median ratio", () => {
  const m = methodPairs(rows, "U");
  assert.equal(m.length, 1);
  assert.equal(m[0].header, "U_103");
  assert.equal(m[0].n, 41); // the censored U and the standard are left out
  assert.ok(Math.abs(m[0].medianRatio - 1.06) < 1e-9);
  assert.ok(Math.abs(m[0].medianRpd - (0.06 / 1.03) * 100) < 1e-6);
  const v = methodPairs(rows, "V");
  assert.equal(v[0].n, 1);
  assert.ok(Math.abs(v[0].medianRatio - 1.78) < 1e-9);
  assert.deepEqual(methodPairs(rows, "Th"), []);
});

test("a joined value is compared as what it is: the column it came from is named", () => {
  const r = [{ hole_id: "A", from: 0, to: 1, values: { U: 10 }, valueSources: { U: "U_100" }, methodValues: { U: { U_103: 12 } } }];
  assert.equal(methodPairs(r, "U")[0].base, "U_100");
});

test("the method of a column is its trailing number", () => {
  assert.equal(methodSuffix("U_103"), "103");
  assert.equal(methodSuffix("Au2_100"), "100");
  assert.equal(methodSuffix("Au (ppm)"), null);
  assert.equal(methodSuffix(undefined), null);
});

test("a lab repeat pairs with the original's result by the repeat's own method, else with the only one kept when the element is empty", () => {
  const orig = { values: { Au: 1.0 }, methodValues: { Au: { Au_100: 1.4, Au_101: 2.0 } } };
  assert.deepEqual(originalMethodValue(orig, { repeatColumn: "Au2_100" }, "Au"), { header: "Au_100", value: 1.4 });
  assert.equal(originalMethodValue(orig, { repeatColumn: "Au1" }, "Au"), null); // the element's own value is used
  const empty = { values: {}, methodValues: { Au: { Au_100: 1.4 } } };
  assert.deepEqual(originalMethodValue(empty, { repeatColumn: "Au1" }, "Au"), { header: "Au_100", value: 1.4 });
  const two = { values: {}, methodValues: { Au: { Au_100: 1.4, Au_101: 2 } } };
  assert.equal(originalMethodValue(two, { repeatColumn: "Au1" }, "Au"), null); // ambiguous: not guessed
});

test("QAQC duplicates find those pairs", () => {
  const assays = [
    { hole_id: "H1", from: 0, to: 1, sample_id: "A1", values: {}, methodValues: { Au: { Au_100: 1.4 } } }, // the original's only Au is a method column not joined
    { hole_id: "H1", from: 0, to: 1, sample_id: "A1#Au1", parent_id: "A1", sample_type: "lab repeat", repeatColumn: "Au1", values: { Au: 1.5 } },
    { hole_id: "H1", from: 1, to: 2, sample_id: "A2", values: { Au: 3 }, methodValues: { Au: { Au_101: 5 } } },
    { hole_id: "H1", from: 1, to: 2, sample_id: "A2#Au2_101", parent_id: "A2", sample_type: "lab repeat", repeatColumn: "Au2_101", values: { Au: 5.2 } },
  ];
  const p = duplicatePairs(assays, "Au", { Au: "ppm" });
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => [x.v1, x.v2]), [[1.4, 1.5], [5, 5.2]]);
  assert.match(p[0].how, /Au_100/);
  assert.match(p[1].how, /Au_101/);
});

test("a re-import replaces an element's method results, and removing the element removes them", () => {
  const prev = [{ hole_id: "A", from: 0, to: 1, values: { U: 1, V: 2 }, methodValues: { U: { U_103: 1.1 }, V: { V_101: 3 } } }];
  const merged = mergeAssayRows(prev, [{ hole_id: "A", from: 0, to: 1, values: { U: 5 } }]).rows[0];
  assert.deepEqual(merged.methodValues, { V: { V_101: 3 } });
  const gone = removeAssayElement(prev, "V").assays[0];
  assert.deepEqual(gone.methodValues, { U: { U_103: 1.1 } });
  const onlyMethod = removeAssayElement([{ hole_id: "B", from: 0, to: 1, values: { Cu: 1 }, methodValues: { U: { U_103: 2 } } }], "U").assays[0];
  assert.equal(onlyMethod.methodValues, undefined);
});

test("the import keeps the other method results, says so, and the repeat row names its column; QAQC has the tab", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /\(methodValues\[e\.symbol\] \|\| \(methodValues\[e\.symbol\] = \{\}\)\)\[mc\.header\] = convertUnit\(c3\.value, mc\.unit, existingUnit\[e\.symbol\] \|\| e\.unit\);/);
  assert.match(g, /if \(c3\.value == null \|\| c3\.qualifier\) continue;/);
  assert.match(g, /if \(valueSources\[e\.symbol\] === mc\.header \|\| repeatHeaders\.has\(mc\.header\)\) continue;/); // a ticked repeat (Au1) is a duplicate, not a method
  assert.match(g, /if \(Object\.keys\(methodValues\)\.length\) out\.methodValues = methodValues;/);
  assert.match(g, /repeatColumn: rc\.header/);
  assert.match(g, /Other method results kept beside the element's for QAQC > Method pairs: \{list\}\./);
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /<MethodPairsTab methods=\{methods\}/);
  assert.match(q, /\.\.\.\(hasMethodValues \? \["methods"\] : \[\]\)/);
});
