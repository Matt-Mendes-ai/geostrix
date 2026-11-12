// TASKS.csv #2258 — Undrilled zones in a worker (the ground sent as data), and the block count said before Run
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { undrilledZones, undrilledBlockCount } from "../src/lib/undrilledZones.js";
import { collarGround } from "../src/lib/pitShell.js";

function box(x0, x1, y0, y1, z0, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}
const unit = box(0, 100, 0, 60, 900, 1000);
const traces = [[{ x: 30, y: 30, z: 1100 }, { x: 30, y: 30, z: 800 }]];
const collars = [{ x: 0, y: 0, z: 980 }, { x: 100, y: 0, z: 980 }, { x: 0, y: 60, z: 980 }, { x: 100, y: 60, z: 980 }];

test("the count before Run is the grid the run makes", () => {
  for (const cell of [2.5, 5, 7]) {
    const r = undrilledZones({ solid: unit, traces, coverM: 20, cellM: cell });
    assert.equal(undrilledBlockCount(unit.positions, cell), r.block.resolution.reduce((a, b) => a * b, 1), String(cell));
  }
  assert.equal(undrilledBlockCount(unit.positions, 0), 0);
  assert.equal(undrilledBlockCount(new Float64Array(0), 5), 0);
});

test("the worker gives the result the main thread gave, with the collar ground built from the collars it is sent", async () => {
  const sent = [];
  globalThis.self = { postMessage: (m) => sent.push(m) };
  await import("../src/lib/undrilledZones.worker.js");
  const args = { solid: unit, traces, coverM: 20, cellM: 5, minZoneM3: null, minZoneBlocks: 8 };
  globalThis.self.onmessage({ data: { args, ground: { collars } } });
  const direct = undrilledZones({ ...args, groundAt: collarGround(collars) });
  assert.ok(sent[0].result, JSON.stringify(sent[0]));
  assert.equal(sent[0].result.aboveGroundCells, direct.aboveGroundCells);
  assert.ok(direct.aboveGroundCells > 0); // the top 20 m of the box is above the collars' 980
  assert.equal(sent[0].result.zones.length, direct.zones.length);
  assert.equal(sent[0].result.uncoveredCells, direct.uncoveredCells);
  globalThis.self.onmessage({ data: { args: { ...args, coverM: 0 }, ground: null } });
  assert.match(sent[1].failed, /coverage distance/);
  delete globalThis.self;
});

test("the pane runs it through the client, cancels on close, and shows the block count", () => {
  const p = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.ok(!/setTimeout\(\(\) => \{ \/\/ let the busy state paint/.test(p));
  assert.match(p, /useEffect\(\(\) => \(\) => job\.current\?\.cancel\(\), \[\]\);/);
  assert.match(p, /tr\("About \{n\} blocks in the unit's box at this size\."/);
  const c = fs.readFileSync("src/lib/undrilledZonesClient.js", "utf8");
  assert.match(c, /new Worker\(new URL\("\.\/undrilledZones\.worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
});
