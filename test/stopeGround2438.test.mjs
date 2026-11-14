// TASKS.csv #2438 — Stope outlines: no stope above the ground (less a crown), a flat body is said to be one, the dip is of the body
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";
import { ceilingLookup } from "../src/lib/pitCeiling.js";
import { groundGrid, flatBodyCheck, stopeGroundSource } from "../src/lib/stopeGround.js";

// a 10 x 10 x 6 model of 6 m blocks from RL 300 to 336, all ore; the ground flat at RL 330 (the model sticks out 6 m above it)
const cells = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 6; k++) cells.push({ x: 3 + i * 6, y: 3 + j * 6, z: 303 + k * 6, dx: 6, dy: 6, dz: 6, value: 500 });
const opts = { cutoff: 200, levelH: 6, density: 1.9 };

test("no ground: every level is outlined, the one above the ground too", () => {
  const r = stopeOutlines({ cells }, opts);
  assert.equal(r.levels.filter((l) => l.stopes.length).length, 6);
  assert.equal(r.ground, null);
});

test("the ground grid closes the levels above it; a crown closes more", () => {
  const g = groundGrid(cells, () => 330);
  assert.ok(g && g.frame.dx === 6 && g.frame.nx > 10, JSON.stringify(g?.frame));
  const at = ceilingLookup(g.values, g.frame);
  const r = stopeOutlines({ cells }, { ...opts, groundAt: at });
  const tops = r.levels.filter((l) => l.stopes.length).map((l) => l.top);
  assert.ok(tops.every((t) => t <= 330 + 1e-9), JSON.stringify(tops));
  assert.equal(tops.length, 5); // 300-306 ... 324-330
  assert.equal(r.ground.shut, 100); // the 100 columns of the 330-336 level
  const c = stopeOutlines({ cells }, { ...opts, groundAt: at, crown: 10 });
  assert.equal(c.levels.filter((l) => l.stopes.length).length, 3); // tops at 306, 312, 318: 318 + 10 <= 330
  assert.equal(c.ground.crown, 10);
  // no ground known at a place (NaN) leaves it open
  const open = stopeOutlines({ cells }, { ...opts, groundAt: () => NaN });
  assert.equal(open.levels.filter((l) => l.stopes.length).length, 6);
});

test("the flat-body test: a 60 x 60 m outline on a 3 m level is flat (over 10 x), on a 6 m level not quite; a 12 m wide one is not", () => {
  // #3317 — flat needs the body thin too (its plan width over 3 x its height): a 6 m seam, one block thick
  const seam = cells.filter((c) => c.z < 306);
  const r = stopeOutlines({ cells: seam }, { ...opts, levelH: 3 });
  const f = flatBodyCheck(r.levels, 3);
  assert.ok(f.flat && Math.round(f.a) === 60 && Math.round(f.b) === 60 && f.h === 3, JSON.stringify(f));
  assert.equal(flatBodyCheck(stopeOutlines({ cells: seam }, opts).levels, 6).flat, false); // 60 m is exactly 10 x 6 m
  // #3317 — the same 60 x 60 m outlines on a body 36 m tall: wide on each level, but massive, not flat
  const m = flatBodyCheck(stopeOutlines({ cells }, { ...opts, levelH: 3 }).levels, 3);
  assert.ok(!m.flat && m.massive && m.bodyH >= 30, JSON.stringify(m));
  const narrow = cells.filter((c) => c.x < 12);
  const n = flatBodyCheck(stopeOutlines({ cells: narrow }, opts).levels, 6);
  assert.equal(n.flat, false);
  assert.equal(flatBodyCheck([], 6), null);
});

test("the ground source: terrain first, else the collars, never underground collars", () => {
  assert.equal(stopeGroundSource(null, []).at, null);
  const s = stopeGroundSource(null, [{ x: 0, y: 0, z: 330 }, { x: 60, y: 60, z: 330 }]);
  assert.equal(s.source, "collars"); assert.ok(Math.abs(s.at(30, 30) - 330) < 1e-9);
  const ug = stopeGroundSource(null, [{ hole_id: "a", x: 0, y: 0, z: 100, dip: -30 }, { hole_id: "b", x: 50, y: 0, z: 120, dip: -20 }]);
  assert.equal(ug.at, null); assert.equal(ug.underground, true);
});

test("the pane: the dip of the body, the crown, the ground to the worker, the notes", () => {
  const p = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.ok(p.includes('tr("Dip of the body (°)")') && !p.includes('tr("Vein dip (°)")'));
  assert.match(p, /field\("crown", tr\("Crown under the ground \(m\)"\)/);
  assert.match(p, /\(level, levels\) => setBusy\(\{ level, levels \}\), groundIn(, alsoChosen \/\* #3084 \*\/)?\)/);
  assert.match(p, /flat\?\.flat && <div style=\{warn\}>/);
  assert.match(fs.readFileSync("src/lib/stopeOutlines.worker.js", "utf8"), /const groundAt = ground \? ceilingLookup\(ground\.values, ground\.frame\) : null;/);
});
