// TASKS.csv #2276 — Mine Design never takes the surface between UNDERGROUND collars as the ground
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPitShell, runPitSeries } from "../src/lib/pitShell.js";

const inputs = { unit: "g/t", element: "Au", price: 1800, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 60, density: 2.7, slopeDeg: 45, revenueFactor: 1, size: null };
const cells = [];
for (let k = 0; k < 10; k++) cells.push({ x: 5, y: 5, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 3 });
for (let k = 0; k < 6; k++) cells.push({ x: 15, y: 5, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 3 });
const surface = [{ hole_id: "A", x: 5, y: 5, z: 100, dip: 60 }, { hole_id: "B", x: 15, y: 5, z: 60, dip: 60 }];
const underground = [...surface, { hole_id: "U1", x: 6, y: 6, z: 40, dip: -10 }, { hole_id: "U2", x: 14, y: 6, z: 30, dip: -25 }];

test("the pit shell and the pit series refuse a ground made of underground collars, with the counts", () => {
  const r = runPitShell({ ...inputs, cells }, { collars: underground });
  assert.equal(r.failed, "underground");
  assert.equal(r.underground.upward, 2);
  const s = runPitSeries({ ...inputs, cells }, [0.8, 1], { collars: underground });
  assert.equal(s.failed, "underground");
  // surface collars still make the ground (#1353)
  assert.equal(runPitShell({ ...inputs, cells }, { collars: surface }).groundSource, "collars");
});

test("pit design, dumps and design strings do not use them either; the panes say why", () => {
  const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.ok(rd("../src/lib/pitDesign.worker.js").includes('if (ug.underground) { self.postMessage({ failed: "underground", underground: ug }); return; }'));
  for (const p of ["../src/components/DumpPane.jsx", "../src/components/DesignStringsPane.jsx"]) assert.ok(rd(p).includes(": ug?.underground ? null : collarGround(collars)), [terrain, collars, ug]);"), p);
  for (const p of ["../src/components/PitShellPane.jsx", "../src/components/NestedPitsPane.jsx", "../src/components/PitDesignPane.jsx"]) assert.ok(rd(p).includes('"The collars look like underground drill positions ({upward} hole(s) drilled upward'), p);
});
