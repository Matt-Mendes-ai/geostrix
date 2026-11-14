// TASKS.csv #3178 (split from #3014 part c) — Identify on a block of an estimation set listed the clicked model's value only: the set's other
// elements at the same block now follow, each by one lattice lookup. (#3178's second item, a revenue model with penalties, moved to #3164.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setValuesAt } from "../src/lib/viewer/identify.js";
import { setMembersOf } from "../src/lib/estimateSet.js";

const set = { id: "s1", primary: "Fe", elements: ["Fe", "Mn", "LOI"] };
const grid = (f, el, skip = () => false) => {
  const cells = [];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) if (!skip(i, k)) cells.push({ x: 5 + 10 * i, y: 5, z: 405 + 10 * k, dx: 10, dy: 10, dz: 10, value: f(i, k) });
  return { id: el, name: `${el} estimate`, cells, params: { element: el, unit: "%", set } };
};
const fe = grid((i, k) => 50 + i + k, "Fe"), mn = grid((i, k) => 0.1 * (i + 1) + k, "Mn"), loi = grid((i) => 4 + i / 3, "LOI", (i, k) => i === 3 && k === 2);
const other = { ...grid(() => 1, "Au"), params: { element: "Au", unit: "ppm" } }; // not in the set

test("the set's other elements at the clicked block, by lattice; a member without that block; not a set", () => {
  const members = setMembersOf(fe, [fe, mn, loi, other]);
  assert.deepEqual(members.map((m) => m.params.element), ["Mn", "LOI"]);
  const at = (i, k) => fe.cells.find((c) => c.x === 5 + 10 * i && c.z === 405 + 10 * k);
  assert.equal(setValuesAt(fe, at(1, 0), members), "Mn (%) 0.2 · LOI (%) 4.333");
  assert.equal(setValuesAt(fe, at(3, 2), members), "Mn (%) 2.4 · LOI (%) —");
  assert.equal(setValuesAt(fe, at(0, 0), []), null);
  assert.equal(setValuesAt(other, other.cells[0], setMembersOf(other, [fe, mn, other])), null);
  // the lookups are built once per clicked model and reused; a member replaced (a re-run) is seen
  const mn2 = grid(() => 9, "Mn");
  assert.equal(setValuesAt(fe, at(1, 0), [mn2, loi]), "Mn (%) 9 · LOI (%) 4.333");
});

test("wiring: the block-model branch only; the view passes its block models; no new keys", () => {
  const s = readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const branch = s.slice(s.indexOf("if (o.userData?.srcModel) {"), s.indexOf("const rs = ctx.rasterOf(o);"));
  assert.match(branch, /const set = setValuesAt\(m, c, ctx\.setMembersOf\?\.\(m\)\); \/\/ #3178\n\s*if \(set\) fields\.push\(\[tr\("Set"\), set\]\);/);
  assert.equal(s.split("setValuesAt(").length - 1, 2, "defined once, called once");
  assert.match(s, /setMembersOf: \(m\) => setMembersOf\(m, r\.voxelModels \|\| \[\]\), \/\/ #3178/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const identify = useIdentify\(\{[^\n]*assays \/\* #2938 \*\/, voxelModels \/\* #3178 — a set's members at the picked block \*\/, units:/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")).Set, l);
});
