// TASKS.csv #3186 (split from #2322) — a DXF / OBJ solid brought onto a local grid tied to a real CRS: one question, then x / y through the tie
// (lib/solidTie.js), elevation unchanged, normals turned by the grid's rotation. SYNTHETIC tie and solid.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tieFromOrigin, worldToLocal, localToWorld } from "../src/lib/localGridTie.js";
import { solidTieGuess, solidPartsToLocal } from "../src/lib/solidTie.js";

// local (0, 0) = world (500000, 5500000); the grid turned 30 degrees counter-clockwise from the world's
const tie = tieFromOrigin({ lx: 0, ly: 0, wx: 500000, wy: 5500000, rotationDeg: 30, scale: 1, epsg: 26910 });
const collars = [{ x: 100, y: 100 }, { x: 200, y: 120 }, { x: 150, y: 300 }];
const inWorld = (lx, ly) => localToWorld(tie, lx, ly);

test("x and y go through the tie, elevation is unchanged, the round trip returns the local numbers", () => {
  const pts = [[100, 100, 350], [200, 120, 300], [150, 300, 250]];
  const w = new Float64Array(pts.flatMap(([x, y, z]) => { const q = inWorld(x, y); return [q.x, q.y, z]; }));
  const [part] = solidPartsToLocal([{ positions: w, indices: new Uint32Array([0, 1, 2]), layer: "pit" }], tie);
  pts.forEach(([x, y, z], i) => { assert.ok(Math.abs(part.positions[i * 3] - x) < 1e-6); assert.ok(Math.abs(part.positions[i * 3 + 1] - y) < 1e-6); assert.equal(part.positions[i * 3 + 2], z); });
  assert.equal(part.layer, "pit"); assert.deepEqual(Array.from(part.indices), [0, 1, 2]);
  assert.equal(w[0], inWorld(100, 100).x, "the input array is not changed");
});

test("normals turn by the grid's rotation only (a world +x normal is 30 degrees clockwise in the local grid)", () => {
  const p = { positions: new Float64Array([500000, 5500000, 0]), indices: new Uint32Array([0, 0, 0]), normals: new Float32Array([1, 0, 0.5]) };
  const [out] = solidPartsToLocal([p], tie);
  assert.ok(Math.abs(out.normals[0] - Math.cos(Math.PI / 6)) < 1e-6 && Math.abs(out.normals[1] + Math.sin(Math.PI / 6)) < 1e-6 && out.normals[2] === 0.5);
  const back = worldToLocal(tie, 500000 + 1, 5500000);
  assert.ok(Math.abs(back.x - out.normals[0]) < 1e-6 && Math.abs(back.y - out.normals[1]) < 1e-6, "the same as a displacement through the tie");
});

test("the hint: the nearer reading wins when it is 10 times nearer, else none", () => {
  const q = inWorld(150, 170), asWorld = { positions: new Float64Array([q.x - 5, q.y - 5, 0, q.x + 5, q.y + 5, 0]) };
  const g = solidTieGuess([asWorld], tie, collars);
  assert.equal(g.suggest, "tie"); assert.ok(g.viaTieM < 50 && g.asLocalM > 1e6);
  assert.equal(solidTieGuess([{ positions: new Float64Array([140, 160, 0, 160, 180, 0]) }], tie, collars).suggest, "local");
  assert.equal(solidTieGuess([{ positions: new Float64Array([0, 0, 0]) }], tie, []).suggest, null, "no collars: no hint");
});

test("the wiring in importSolidFile: tied grids only, one confirm, the parts replaced before the bounds, the notice and provenance say so", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /const gridTie = tieOf\(project\);\n\s*let viaTie = false;\n\s*if \(gridTie\) \{/);
  assert.match(v, /if \(viaTie\) solid\.parts = \(await import\("\.\.\/lib\/solidTie\.js"\)\)\.solidPartsToLocal\(solid\.parts, gridTie\);\n\s*\}\n\s*const bounds = solidBounds\(solid\.parts\);/);
  assert.match(v, /crsAssumed: viaTie \? `placed onto the local grid through its tie/);
  assert.match(v, /viaTie \? notice\("Imported \\"\{name\}\\" as a solid:/);
  assert.match(v, /\[fitBox, project\?\.epsg, project\?\.crsSet, project\?\.localGrid, setTaskProgress\]/);
});
