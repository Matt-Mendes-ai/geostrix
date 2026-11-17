// TASKS.csv #3742 (follow-up of #3733) — a one-click merge for collar attribute values that are one value spelled two ways ('D Zone' / 'D zone', 'Gully' / 'Gully Zone'): the commoner
// spelling wins, other fields and holes with no value are untouched. Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarTwinGroups, mergeCollarTwins, twinGroupText } from "../src/lib/attrTwins.js";
import { holeFieldPicks } from "../src/lib/viewer/holeFieldPicks.js";
import { collarAttrChoices } from "../src/lib/holeFilter.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const c = (id, attrs) => ({ hole_id: id, x: 0, y: 0, z: 0, attrs });
const collars = [c("A", { zone: "D Zone", year: 2023 }), c("B", { zone: "D Zone" }), c("C", { zone: "D zone" }), c("D", { zone: "Gully" }), c("E", { zone: "Gully Zone" }), c("F", { zone: "Gully Zone" }), c("G", {}), c("H", { zone: "Steep" })];

test("#3742 the groups: case and a trailing 'zone' word; numbers and one-spelling fields are left alone", () => {
  const g = collarTwinGroups(collars);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].values, [{ value: "D Zone", n: 2 }, { value: "D zone", n: 1 }]);
  assert.deepEqual(g[1].values, [{ value: "Gully Zone", n: 2 }, { value: "Gully", n: 1 }]);
  assert.equal(twinGroupText(g[0]), "'D Zone' (2), 'D zone' (1)");
  assert.deepEqual(collarTwinGroups([c("A", { year: 2023 }), c("B", { year: 2024 })]), []);
  assert.deepEqual(collarTwinGroups([]), []);
});

test("#3742 the merge writes the commoner spelling on every collar and touches nothing else", () => {
  const m = mergeCollarTwins(collars);
  assert.equal(m.changed, 2);
  assert.deepEqual(m.collars.map((x) => x.attrs?.zone), ["D Zone", "D Zone", "D Zone", "Gully Zone", "Gully Zone", "Gully Zone", undefined, "Steep"]);
  assert.equal(m.collars[0].attrs.year, 2023); assert.equal(m.collars[6], collars[6]); assert.equal(m.collars[0], collars[0]); // an unchanged collar is the same object
  assert.equal(collars[2].attrs.zone, "D zone"); // the input is not mutated
  assert.deepEqual(collarTwinGroups(m.collars), []); // nothing left to merge
  const again = mergeCollarTwins(m.collars); assert.equal(again.collars, m.collars); assert.equal(again.changed, 0);
  // the hole filter's picks see one value
  const picks = holeFieldPicks(m.collars, collarAttrChoices(m.collars));
  assert.deepEqual(picks.find((p) => p.key === "zone").values.slice().sort(), ["D Zone", "Gully Zone", "Steep"]);
});

test("#3742 wired: the Holes list says it and offers the button; keys in four languages", () => {
  const b = read("../src/modules/viewer/HoleFilterBar.jsx");
  assert.match(b, /const twins = useMemo\(\(\) => collarTwinGroups\(collars\), \[collars\]\);/);
  assert.match(b, /setCollars\(\(p\) => mergeCollarTwins\(p\)\.collars\)/);
  for (const k of ["These collar values look like one value spelled two ways: {list}.", "Make them one", "Rewrites the less common spelling of each group to the commoner one, on every collar. Undo brings them back."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
