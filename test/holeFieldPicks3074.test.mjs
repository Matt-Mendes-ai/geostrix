// TASKS.csv #3074 (#2900 (7), WA iron) — the Holes list's collar-field picks: two fields that split the holes the same way are listed once,
// and a field's holes with no value get their own pick.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarAttrChoices } from "../src/lib/holeFilter.js";
import { holeFieldPicks, holesWithoutField, noValuePick } from "../src/lib/viewer/holeFieldPicks.js";

const collars = [];
for (let i = 0; i < 300; i++) {
  const t = i < 58 ? null : i % 3 ? "RC" : "DD";
  collars.push({ hole_id: `H${i}`, attrs: { ...(t ? { DrillholeType: t, "hole type": t === "RC" ? "Reverse circulation (RC)" : "Diamond (DD)" } : {}), Year: String(2018 + (i % 4)) } });
}

test("DrillholeType and 'hole type' split the holes the same way: listed once, the other named; 58 holes with no type get a pick", () => {
  const picks = holeFieldPicks(collars, collarAttrChoices(collars));
  const by = Object.fromEntries(picks.map((p) => [p.key, p]));
  assert.deepEqual(Object.keys(by).sort(), ["DrillholeType", "Year"]);
  assert.deepEqual(by.DrillholeType.also, ["hole type"]);
  assert.equal(by.DrillholeType.missing, 58);
  assert.equal(by.Year.missing, 0);
  assert.equal(noValuePick("hole type"), "hole_type=(no_value)");
  assert.equal(holesWithoutField(collars, noValuePick("DrillholeType")).length, 58);
  assert.equal(holesWithoutField(collars, "hole_type=(no_value)").length, 58, "any field whose name reads the same");
  assert.equal(holesWithoutField(collars, "DrillholeType=RC"), null, "a value pick is the shared matcher's");
});

test("not folded when the split differs (one value maps to two), or the holes without a value differ", () => {
  const c2 = collars.map((c, i) => ({ ...c, attrs: { ...c.attrs, ...(i === 100 ? { "hole type": "Diamond (DD)" } : {}) } }));
  assert.equal(holeFieldPicks(c2, collarAttrChoices(c2)).length, 3);
  const c3 = collars.map((c, i) => (i === 10 ? { ...c, attrs: { ...c.attrs, "hole type": "Reverse circulation (RC)" } } : c));
  assert.equal(holeFieldPicks(c3, collarAttrChoices(c3)).length, 3, "hole 10 has a 'hole type' but no DrillholeType");
});

test("wiring: the Holes list's picks, the 'also' label and the no-value option and filter", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8");
  assert.match(s, /const none = holesWithoutField\(collars, filter\), found = none \? \{ holes: none, byField: false \} : holesForFilter\(collars, filter\);/);
  assert.match(s, /\{picks\.map\(\(ch\) => <optgroup key=\{ch\.key\} label=\{ch\.also\.length \? tr\("\{field\} \(also \{others\}\)"/);
  assert.match(s, /\{ch\.missing > 0 && <option value=\{noValuePick\(ch\.key\)\}>\{tr\("\{field\} = \(no value\): \{n\} hole\(s\)"/);
});
