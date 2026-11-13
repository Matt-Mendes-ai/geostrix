// TASKS.csv #2915 (review #2876, WA iron) — a custom layer of 42 codes was dropped from Grade stats and Compositing without a word, and a
// numeric field of the Lithology log (a clay %) was offered nowhere but SQL
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customDomainOptions, attributeDomainLabel, OTHER_CODES } from "../src/lib/customDomains.js";
import { numericSourceChoices, sourceAssays } from "../src/lib/numericSources.js";
import { logClasses } from "../src/lib/logClasses.js";

// 42 material codes on 3 holes; code M0 the longest, M41 the shortest
const codes = Array.from({ length: 42 }, (_, i) => `M${i}`);
const rows = [];
for (let h = 0; h < 3; h++) { let d = 0; codes.forEach((c, i) => { for (let k = 0; k < 2; k++) { const L = (42 - i) / 10; rows.push({ hole_id: `H${h}`, from: d, to: d + L, value: c }); d += L; } }); }
const layer = { id: "mat", name: "Material type", rows };

test("over 30 codes: left out by default, offered as the 12 commonest by length + other when asked", () => {
  assert.equal(customDomainOptions([layer]).length, 0, "the old callers see no change");
  const [d] = customDomainOptions([layer], null, { groupTop: 12 });
  assert.equal(d.key, "custom:mat:value:top12");
  assert.deepEqual(d.grouped, { kept: 12, of: 42 });
  const vals = new Set(d.rows.map((r) => r.value));
  assert.equal(vals.size, 13);
  for (let i = 0; i < 12; i++) assert.ok(vals.has(`M${i}`), `M${i}`);
  assert.ok(vals.has(OTHER_CODES));
  assert.equal(d.rows.length, rows.length, "every row kept, the rest as other");
  assert.equal(attributeDomainLabel(d, (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k])), 'Material type · value: the 12 commonest of 42 codes, the rest as "other"');
});

test("a field of 30 codes or fewer is unchanged, and free text (every value different) is still left out", () => {
  const few = { id: "f", name: "Few", rows: rows.filter((r) => Number(r.value.slice(1)) < 5) };
  const [d] = customDomainOptions([few], null, { groupTop: 12 });
  assert.equal(d.key, "custom:f:value"); assert.equal(d.grouped, undefined);
  const free = { id: "t", name: "Notes", rows: Array.from({ length: 200 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, value: `note ${i}` })) };
  assert.equal(customDomainOptions([free], null, { groupTop: 12 }).length, 0);
});

test("a numeric extra field of a built-in log is a source when asked: X-Y axis and Grade stats classes", () => {
  const litho = Array.from({ length: 40 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, value: i < 20 ? "ONAM" : "BNAM", Met_CLA_pct: i < 20 ? 5 + (i % 4) : 40 + (i % 7), Wet_Dry: i % 2 ? "W" : "D" }));
  const layers = { litho };
  assert.equal(numericSourceChoices({ layers }).length, 0, "not by default (the other modules' lists are unchanged)");
  const ch = numericSourceChoices({ layers, builtinFields: { labelOf: () => "Lithology" } });
  assert.deepEqual(ch.map((c) => c.key), ["log:litho:Met_CLA_pct"]);
  assert.equal(ch[0].label, "Lithology › Met_CLA_pct");
  const { assays } = sourceAssays(ch[0], { layers });
  assert.equal(assays.length, 40);
  const samples = Array.from({ length: 40 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1 }));
  const cls = logClasses(ch[0], { layers }, samples);
  assert.ok(cls && cls.breaks.length >= 2);
  assert.notEqual(cls.classOf(samples[0]), cls.classOf(samples[39]));
});

test("wiring: Grade stats and Compositing group, and say so; X-Y and Grade stats read the built-in fields", () => {
  const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  for (const f of ["../src/components/GradeStatistics.jsx", "../src/components/CompositingModal.jsx"]) {
    const s = rd(f);
    assert.match(s, /\{ groupTop: 12 \}/, f);
    assert.match(s, /d\.attribute \|\| d\.grouped \? attributeDomainLabel\(d, tr\) : d\.label/, f);
  }
  assert.match(rd("../src/modules/GeochemModule.jsx"), /numericSourceChoices\(\{ layers: store\.layers, customLayers: store\.customLayers, logValidRange: store\.project\?\.logValidRange \/\* #3116 \*\/, builtinFields:/);
  assert.match(rd("../src/components/GradeStatistics.jsx"), /numericSourceChoices\(\{ layers: storeLayers, customLayers, models: false, logValidRange: storeProject\?\.logValidRange \/\* #3116 \*\/, builtinFields:/);
});
