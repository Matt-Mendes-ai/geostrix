// TASKS.csv #3117 (the rest of #3055, WA iron) — adding an assay element builds only its own markers: the shown elements' batches are
// kept while their inputs are the same, and moved in place when the ring offsets change with the number of elements shown.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { makeAssayBatcher } from "../src/lib/viewer/assayBatcher.js";
import { buildLayerBatches, eachLayerMember, batchTag } from "../src/lib/viewer/layerBatches.js";
import { assayProto, placeAssayMarker } from "../src/lib/viewer/assayShape.js";
import { traceLookup } from "../src/lib/viewer/modelHelpers.js";
import { syncAssayElements, shiftMarkers, sameKey } from "../src/lib/viewer/assayKeep.js";

const at = traceLookup([{ md: 0, x: 0, y: 100, z: 0 }, { md: 200, x: 40, y: -90, z: 10 }]).at;
const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ from: i * 0.6, to: i * 0.6 + 0.6, k: i }));
const ROWS = { Fe: rowsOf(300), Si: rowsOf(120), Al: rowsOf(10) }; // Al: a family under 24, drawn as plain meshes
const built = [];
const builder = (offs) => (sym, into) => {
  built.push(sym);
  const b = makeAssayBatcher(), [ox, oz] = offs[sym];
  for (const r of ROWS[sym]) b.add(assayProto("sphere"), { color: "#d98b2b" }, (t) => placeAssayMarker(t, "sphere", at, r, 1.5, ox, oz), () => ({ sym, k: r.k }));
  b.finish(into);
  buildLayerBatches(into);
};
const keyOf = { Fe: ["fe-style"], Si: ["si-style"], Al: ["al-style"] };
const specs = (offs) => Object.keys(offs).map((sym) => ({ sym, key: keyOf[sym], offX: offs[sym][0], offZ: offs[sym][1] }));
// every drawn marker of an element: its world x / z
const xz = (g, sym) => { const out = []; eachLayerMember(g, (m) => { if (m.userData?.sym !== sym) return; const p = new THREE.Vector3(); m.updateMatrixWorld?.(); m.getWorldPosition(p); out.push([p.x, p.z]); }); return out; };
// the same points within float32 precision (the batches store Float32 matrices)
const near = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach(([x, z], i) => assert.ok(Math.abs(x - b[i][0]) < 1e-3 && Math.abs(z - b[i][1]) < 1e-3, `${msg}: ${i} ${[x, z]} vs ${b[i]}`)); };
const fresh = (offs) => { const g = new THREE.Group(); builder(offs)(Object.keys(offs)[0], g); return g; };

test("one element, then a second: the first is moved to its new ring offset, not built again", () => {
  const g = new THREE.Group(), kept = new Map();
  built.length = 0;
  let r = syncAssayElements(g, kept, specs({ Fe: [0, 0] }), builder({ Fe: [0, 0] }));
  assert.deepEqual(r.built, ["Fe"]);
  const one = xz(g, "Fe");
  assert.equal(one.length, 300);
  built.length = 0;
  r = syncAssayElements(g, kept, specs({ Fe: [7, 0], Si: [-7, 0] }), builder({ Fe: [7, 0], Si: [-7, 0] }));
  assert.deepEqual(built, ["Si"], "only Si is built");
  assert.deepEqual(r.moved, ["Fe"]);
  const moved = xz(g, "Fe");
  near(moved, one.map(([x, z]) => [x + 7, z]), "Fe moved 7 m in x");
  near(moved, xz(fresh({ Fe: [7, 0] }), "Fe"), "the same as building Fe at its new offset from scratch");
  assert.equal(xz(g, "Si").length, 120);
  // nothing changed: nothing built or moved
  built.length = 0;
  r = syncAssayElements(g, kept, specs({ Fe: [7, 0], Si: [-7, 0] }), builder({ Fe: [7, 0], Si: [-7, 0] }));
  assert.deepEqual([built, r.kept], [[], ["Fe", "Si"]]);
});

test("a changed input rebuilds that element only; a removed one leaves the group; a family under 24 is rebuilt, not moved", () => {
  const g = new THREE.Group(), kept = new Map();
  syncAssayElements(g, kept, specs({ Fe: [5, 0], Al: [-5, 0] }), builder({ Fe: [5, 0], Al: [-5, 0] }));
  const al = xz(g, "Al");
  assert.equal(al.length, 10);
  assert.ok(g.children.some((c) => c.isMesh && !c.isInstancedMesh), "Al drawn as plain meshes");
  built.length = 0;
  syncAssayElements(g, kept, specs({ Fe: [0, 4], Al: [0, -4] }), builder({ Fe: [0, 4], Al: [0, -4] }));
  assert.deepEqual(built, ["Al"], "Fe moved in place; Al's plain meshes rebuilt (the pick signature would not see them move)");
  near(xz(g, "Al"), al.map(([x, z]) => [x + 5, z - 4]), "Al at its new offset");
  keyOf.Fe = ["fe-style-2"]; // Fe's style changed
  built.length = 0;
  syncAssayElements(g, kept, specs({ Fe: [0, 4], Al: [0, -4] }), builder({ Fe: [0, 4], Al: [0, -4] }));
  assert.deepEqual(built, ["Fe"]);
  const before = g.children.length;
  syncAssayElements(g, kept, specs({ Al: [0, 0] }), builder({ Al: [0, 0] }));
  assert.equal(xz(g, "Fe").length, 0, "Fe's batches left the group");
  assert.ok(g.children.length < before && !kept.has("Fe"));
  // a clear from outside (the drillhole rebuild clears the group): built again
  while (g.children.length) g.remove(g.children[0]);
  built.length = 0;
  syncAssayElements(g, kept, specs({ Al: [0, 0] }), builder({ Al: [0, 0] }));
  assert.deepEqual(built, ["Al"]);
  assert.equal(xz(g, "Al").length, 10);
});

test("a hidden row keeps its hidden scale when moved; helpers", () => {
  const g = fresh({ Fe: [0, 0] }), inst = g.children[0], cp = inst.userData.compact;
  cp.hidden[3] = 1; inst.instanceMatrix.array[48] = 0; // hidden: zero scale, as syncCompact draws it
  const x0 = cp.base[12], hx = inst.instanceMatrix.array[3 * 16 + 12];
  assert.ok(shiftMarkers(inst, 2, 3));
  assert.equal(cp.base[12], Math.fround(x0 + 2));
  assert.equal(inst.instanceMatrix.array[3 * 16 + 12], Math.fround(hx + 2));
  assert.equal(inst.instanceMatrix.array[48], 0, "still hidden");
  assert.equal(cp.moves, 1, "counted, for the pick index's batch tag");
  assert.match(batchTag(inst), /m1$/, "a moved batch changes its pick tag (#304: the index is rebuilt)");
  assert.equal(shiftMarkers(new THREE.Group(), 1, 1), false, "anything else is rebuilt instead");
  assert.equal(shiftMarkers(new THREE.Mesh(), 1, 1), false, "a plain mesh too");
  const a = {}; assert.ok(sameKey([a, 1], [a, 1]) && !sameKey([a, 1], [{}, 1]) && !sameKey(null, []));
});

test("wiring: buildAssaySpheres keeps elements through syncAssayElements, keyed on what their markers depend on", () => {
  const s = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(s, /key: \[assays, assaySource, assayStyle\[sym\], idx, assayShapeFor\(assayStyle\[sym\], drawnAssays\), ranges\[sym\], collars, traces, elementUnits\[sym\]\]/);
  assert.match(s, /syncAssayElements\(g, assayKeptRef\.current, specs, \(sym, into\) => \{/);
  assert.match(s, /\{ clearGroup\(g\); assayKeptRef\.current\.clear\(\); return; \}/, "switched off: cleared and forgotten");
});
