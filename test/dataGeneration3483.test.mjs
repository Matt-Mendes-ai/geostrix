// TASKS.csv #3483 (side 1's #3464) — every generation of the layers, collars and assays a reprojection replaced stayed alive: the 3D View's
// memos kept older renders' scopes (V8 shares one context per render between all of its closures), each holding that render's tables and the
// memos that were stale in it. A component of the same shape, rendered with react-test-renderer: with React's own useCallback the old tables
// are still reachable after a GC; with the 3D View's (the data generation in every memo's dependencies) only the current one is.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import v8 from "node:v8";
import vm from "node:vm";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useDataGeneration, useCallbackGen, useMemoGen, generationTables } from "../src/modules/viewer/dataGeneration.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc");
const settle = async () => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); gc(); } };

// table: a big table replaced by a copy (a reprojection); other: a value that changes in a render of its own (a pick mode, a style)
function makeView({ useCallback, useMemo, generation }) {
  const handler = { current: null }; // as the import input's onChange prop: the latest render's closure, held by the DOM
  function View({ table, other }) {
    if (generation) useDataGeneration([table]);
    const label = useCallback(() => `mode ${other}`, [other]); // made again only when `other` changes
    const count = useCallback(() => table.length, [table]);
    const both = useMemo(() => () => label() + count(), [label, count]);
    handler.current = () => [both(), table[0]];
    return null;
  }
  return { View, handler };
}

async function run(hooks) {
  const { View, handler } = makeView(hooks);
  const refs = [];
  let table = null, r;
  const next = () => { table = Array.from({ length: 1000 }, (_, i) => ({ i, gen: refs.length })); refs.push(new WeakRef(table)); return table; };
  await act(async () => { r = TestRenderer.create(React.createElement(View, { table: next(), other: 0 })); });
  for (let g = 1; g <= 5; g++) {
    await act(async () => { r.update(React.createElement(View, { table, other: g })); }); // a render of its own: `label` made again, the table not
    await act(async () => { r.update(React.createElement(View, { table: next(), other: g })); }); // the table replaced
  }
  await act(async () => { r.update(React.createElement(View, { table, other: 5 })); }); // one more render: React's alternate fiber keeps the previous render's props until then
  table = null;
  await settle();
  const alive = refs.map((w) => w.deref() !== undefined);
  assert.equal(handler.current()[1].gen, 5, "the handler sees the current table");
  await act(async () => r.unmount());
  return alive;
}

test("the leak's shape, with React's own memos: earlier tables stay reachable through the memos made in their renders", async () => {
  const alive = await run({ useCallback: React.useCallback, useMemo: React.useMemo, generation: false });
  assert.equal(alive[5], true, "the current table");
  assert.ok(alive.slice(0, 5).filter(Boolean).length >= 3, `old tables alive: ${alive.slice(0, 5).map(Number).join("")}`);
});

test("with the data generation in every memo's dependencies only the current table is alive after the replacements", async () => {
  const alive = await run({ useCallback: useCallbackGen, useMemo: useMemoGen, generation: true });
  assert.deepEqual(alive, [false, false, false, false, false, true], `alive: ${alive.map(Number).join("")}`);
});

test("useDataGeneration: a new number only when one of the tables is a new object; memos keep their identity otherwise", async () => {
  const seen = [];
  function Probe({ a, b, x }) {
    const g = useDataGeneration([a, b]);
    const f = useCallbackGen(() => x, [x]);
    seen.push({ g, f });
    return null;
  }
  const A = [1], B = [2];
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(Probe, { a: A, b: B, x: 1 })); });
  await act(async () => { r.update(React.createElement(Probe, { a: A, b: B, x: 1 })); });
  await act(async () => { r.update(React.createElement(Probe, { a: A, b: [2], x: 1 })); });
  await act(async () => { r.update(React.createElement(Probe, { a: A, b: B, x: 2 })); });
  await act(async () => r.unmount());
  assert.deepEqual(seen.map((s) => s.g), [1, 1, 2, 3]);
  assert.equal(seen[1].f, seen[0].f, "same tables, same deps: the same function");
  assert.notEqual(seen[2].f, seen[1].f, "a table replaced: made again");
});

test("generationTables: what the drillhole build follows; a geophysics-points import (#1582) and assays alone start no generation", () => {
  const lith = [1], ox = [2], pts = [3], col = [4], sv = [5], cl = [6], asy = [7];
  const base = generationTables({ collars: col, survey: sv, customLayers: cl, assays: asy, layers: { litho: lith, oxidation: ox, geophys_pts: pts } });
  assert.deepEqual(base, [col, sv, cl, lith, ox]);
  const same = (t) => t.length === base.length && t.every((v, i) => v === base[i]);
  assert.ok(same(generationTables({ collars: col, survey: sv, customLayers: cl, assays: [8], layers: { litho: lith, oxidation: ox, geophys_pts: [9] } })), "new assays and new points: the same tables");
  assert.ok(same(generationTables({ collars: col, survey: sv, customLayers: cl, layers: { oxidation: ox, geophys_pts: pts, litho: lith } })), "key order does not matter");
  assert.ok(!same(generationTables({ collars: [4], survey: sv, customLayers: cl, layers: { litho: lith, oxidation: ox } })), "new collars (a reprojection): a new generation");
  assert.ok(!same(generationTables({ collars: col, survey: sv, customLayers: cl, layers: { litho: [1], oxidation: ox } })), "a new log table: a new generation");
});

test("wiring: the 3D View's useCallback / useMemo are the generation's, and the generation is set before them", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /import React, \{ useRef, useEffect, useState, Suspense \} from "react";/);
  assert.match(s, /import \{ useDataGeneration, generationTables, useCallbackGen as useCallback, useMemoGen as useMemo \} from "\.\/viewer\/dataGeneration\.js";/);
  const gen = s.indexOf("useDataGeneration(generationTables(store));");
  assert.ok(gen > 0 && gen < s.indexOf("useMemo(") && gen < s.indexOf("useCallback("), "before the first memo");
  assert.doesNotMatch(s, /React\.use(Callback|Memo)\(/, "no memo past the wrapper");
});
