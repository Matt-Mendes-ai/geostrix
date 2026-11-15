// TASKS.csv #3424 step 2 — the 3D View's custom-layer readers that built every row of a layer held as a Table (found by the probe build:
// a copy by spread, the mirror back to the store, the scene's grouping by hole and its per-row tooltips, the unit-source scan, the alpha
// picks, the layer list's count). Each works from the table, and gives what the rows gave. Synthetic data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowsBuilt, rowsOf, tableOps } from "../src/lib/rowTable.js"; import { tableFromRows } from "../src/lib/rowTableBuild.js";
import { publishedLayers, internalLayers, layerWith, rowsRefOf, layerRowCount } from "../src/lib/tableFields.js"; import { indicesByHole } from "../src/lib/tableReaders.js"; import { layerTableOf } from "../src/lib/rowTableBuild.js";
import { rowTip, lazyTip } from "../src/lib/viewer/lazyTip.js";
import { mirrorCustomLayers } from "../src/lib/viewerDirty.js";
import { unitSourceLayers } from "../src/lib/unitSource.js";
import { customAlphaPicks } from "../src/lib/alphaPicks.js";

const H = ["A", "B", "C"];
const logRows = (n) => Array.from({ length: n }, (_, i) => ({ hole_id: H[i % 3], depth: i * 0.1, value: i % 50, _src: "log.las" }));
const fresh = (rows) => tableFromRows(rows.map((r) => ({ ...r }))); // a table whose rows nobody has asked for
const viewOfTable = (t, extra = {}) => publishedLayers([{ id: "g1", name: "gamma", ...extra, rows: t }])[0];

test("layerWith / rowsRefOf / layerRowCount: a copy keeps the lazy rows unbuilt; the count and identity read without building", () => {
  const t = fresh(logRows(3000)), v = viewOfTable(t, { unit: "cps" });
  const c = layerWith(v, { group: "G" });
  assert.equal(c.group, "G"); assert.equal(c.unit, "cps");
  assert.equal(rowsRefOf(c), t, "the Table behind the copied getter");
  assert.equal(layerRowCount(c), 3000);
  assert.equal(rowsBuilt(t), false, "no rows built by the copy, the reference or the count");
  assert.deepEqual(Object.keys(c), ["id", "name", "unit", "rows", "group"]);
  assert.equal(internalLayers([c])[0].rows, t, "the copy goes back to the store as its Table");
  assert.equal(c.rows.length, 3000, "and reading rows still works");
  const plain = { id: "p", rows: [{ a: 1 }] };
  assert.equal(rowsRefOf(plain), plain.rows); assert.equal(layerRowCount(plain), 1);
  assert.equal(layerRowCount({ id: "x" }), 0);
});

test("indicesByHole: row indices by hole in row order, as groupByHole groups rows; a patch's holes only; cached", () => {
  const rows = [...logRows(30), { depth: 5, value: 1 }, { hole_id: "", depth: 6, value: 2 }];
  const t = tableFromRows(rows);
  const m = indicesByHole(t);
  const want = new Map();
  rows.forEach((r, i) => { if (!r.hole_id) return; if (!want.has(r.hole_id)) want.set(r.hole_id, []); want.get(r.hole_id).push(i); });
  assert.deepEqual([...m.entries()].sort(), [...want.entries()].sort());
  assert.equal(indicesByHole(t), m, "cached per table");
  assert.deepEqual([...indicesByHole(t, new Set(["B"])).keys()], ["B"]);
  const num = tableFromRows([{ hole_id: 7, depth: 1 }, { hole_id: 8, depth: 2 }, { hole_id: 7, depth: 3 }]);
  assert.deepEqual([...indicesByHole(num).entries()], [[7, [0, 2]], [8, [1]]], "numeric hole ids");
});

test("rowTip: the row by index on read (not kept), the tooltip from it once, both assignable; lazyTip as before", () => {
  const t = fresh(logRows(100));
  let made = 0;
  const ud = rowTip(t, 7, { holeId: "B" }, (r) => { made++; return `${r.hole_id} @ ${r.depth}`; });
  assert.equal(ud.holeId, "B"); assert.equal(rowsBuilt(t), false);
  assert.deepEqual(ud.row, rowsOf(fresh(logRows(100)))[7]);
  assert.equal(ud.tip, `B @ ${7 * 0.1}`); assert.equal(ud.tip, `B @ ${7 * 0.1}`); assert.equal(made, 1);
  ud.tip = "x"; assert.equal(ud.tip, "x");
  ud.row = { value: 1 }; assert.deepEqual(ud.row, { value: 1 });
  assert.equal(rowsBuilt(t), false, "no table rows built: one row at a time");
  assert.equal(lazyTip({ row: { a: 1 }, holeId: "H" }, () => "t").tip, "t");
});

test("mirrorCustomLayers with a Table layer: no rows built, the same list when nothing changed, a view's edit carried, a new layer kept lazy", () => {
  const t = fresh(logRows(3000));
  const storeList = publishedLayers([{ id: "g1", name: "gamma", unit: "cps", rows: t }]);
  const local = [layerWith(storeList[0], { group: "G" })];
  assert.equal(mirrorCustomLayers(storeList, local), storeList, "unchanged: the previous list");
  assert.equal(rowsBuilt(t), false);
  const renamed = [layerWith(local[0], { name: "gamma 2" })];
  const next = mirrorCustomLayers(storeList, renamed);
  assert.notEqual(next, storeList); assert.equal(next[0].name, "gamma 2"); assert.equal(rowsRefOf(next[0]), t); assert.equal(next[0].unit, "cps");
  assert.equal(next[0].group, undefined, "the view's group never goes to the store");
  const t2 = fresh(logRows(2500));
  const added = mirrorCustomLayers(storeList, [...local, layerWith(viewOfTable(t2), { id: "g2", group: "G2" })]);
  assert.equal(added.length, 2); assert.equal(rowsRefOf(added[1]), t2); assert.equal(added[1].group, undefined);
  assert.equal(rowsBuilt(t) || rowsBuilt(t2), false, "nothing built");
  assert.equal(internalLayers(added)[1].rows, t2, "into the store as its Table");
});

test("unitSourceLayers: a Table layer gives what its rows give, and a depth log is ruled out without building rows", () => {
  const zones = Array.from({ length: 2400 }, (_, i) => ({ hole_id: H[i % 3], from: i, to: i + 1, value: ["AND", "BAS", " TUF ", "", null, 12][i % 6] }));
  const numeric = Array.from({ length: 2400 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, value: i % 9 }));
  const mixed = Array.from({ length: 2400 }, (_, i) => ({ hole_id: "A", from: i, to: i % 5 ? i + 1 : i, value: i % 3 ? "QV" : 4 }));
  for (const rows of [zones, numeric, mixed]) {
    const asRows = unitSourceLayers({}, [{ id: "z", name: "Zones", rows }]);
    const asTable = unitSourceLayers({}, [publishedLayers([{ id: "z", name: "Zones", rows: fresh(rows) }])[0]]);
    assert.deepEqual(asTable, asRows);
  }
  const log = fresh(logRows(3000));
  assert.deepEqual(unitSourceLayers({}, [viewOfTable(log)]), []);
  assert.equal(rowsBuilt(log), false);
});

test("customAlphaPicks: a Table layer with no angle column is skipped without its rows; one with an alpha column gives the rows' picks", () => {
  const log = fresh(logRows(3000));
  assert.deepEqual(customAlphaPicks([viewOfTable(log)]), []);
  assert.equal(rowsBuilt(log), false);
  const veins = Array.from({ length: 2200 }, (_, i) => ({ hole_id: H[i % 3], from: i, to: i + 0.5, value: "QV", VN_ALPHA: (i * 7) % 91, VN_BETA: (i * 11) % 360 }));
  assert.deepEqual(customAlphaPicks([publishedLayers([{ id: "v", name: "Veins", rows: fresh(veins) }])[0]]), customAlphaPicks([{ id: "v", name: "Veins", rows: veins }]));
  assert.ok(customAlphaPicks([{ id: "v", name: "Veins", rows: veins }]).length > 2000);
});

test("wiring: the scene groups a Table layer by index and its tooltips keep the index; ViewerModule's two call swaps; the mirror", () => {
  const scene = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(scene, /const tableOfLayer = \(l\) => \{ const r = rowsRefOf\(l\); return isTable\(r\) \? r : null; \};/);
  assert.match(scene, /!t \? byHoleIf\(l\.id, l\.rows\) : !rebuild\.has\(l\.id\) \? NO_HOLES : tableOps\.indicesByHole\(t, patched\.has\(l\.id\) \? patchHoles\(l\.id\) : null\)/);
  assert.match(scene, /const row = lt \? rowOf\(lt, entry\) : entry;/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /return layerWith\(l, \{ group \}\); \/\/ #3424/);
  assert.match(vm, /\(\{layerRowCount\(l\) \/\* #3424 \*\/\}\)<\/span>/);
  assert.doesNotMatch(vm, /return \{ \.\.\.l, group \};/);
  const dirty = readFileSync(new URL("../src/lib/viewerDirty.js", import.meta.url), "utf8");
  assert.match(dirty, /const o = layerWith\(old, \{ id: l\.id \}\);/);
});

test("startup size: the table readers register with the build half; layerTableOf on a copy, a view, a plain Table layer and rows", () => {
  const t = fresh(logRows(2100));
  assert.equal(tableOps.indicesByHole, indicesByHole); assert.equal(typeof tableOps.presentElements, "function"); assert.equal(typeof tableOps.unitCodes, "function");
  assert.equal(layerTableOf(layerWith(viewOfTable(t), {})), t);
  assert.equal(layerTableOf({ rows: t }), t);
  const rows = logRows(10);
  assert.deepEqual(rowsOf(layerTableOf({ rows })), rows);
});
