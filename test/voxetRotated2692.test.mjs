// TASKS.csv #2692 (from #2632) — a rotated GOCAD Voxet resampled onto an east / north / up lattice, each block the nearest voxet node
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVoxetHeader, voxetToUbc, isVoxetAligned, alignedLattice, resampleVoxet } from "../src/lib/gocadVoxet.js";
import { ubcMeshToCells } from "../src/lib/voxel.js";

const hdr = (u, v, n, extra = []) => ["GOCAD Voxet 1", ...extra, "AXIS_O 100 200 -50", `AXIS_U ${u}`, `AXIS_V ${v}`, "AXIS_W 0 0 20", "AXIS_MIN 0 0 0", "AXIS_MAX 1 1 1", `AXIS_N ${n}`, "PROPERTY 1 D", "PROP_FILE 1 f", "END"].join("\n");
const key = (m) => ubcMeshToCells(m.mesh, Array.from(m.values)).map((c) => [c.x, c.y, c.z, c.value].map((v) => +v.toFixed(6)).join()).sort();

test("aligned or not", () => {
  assert.equal(isVoxetAligned(parseVoxetHeader(hdr("30 0 0", "0 -10 0", "3 2 2"))), true);
  assert.equal(isVoxetAligned(parseVoxetHeader(hdr("21.2 21.2 0", "-10 10 0", "3 2 2"))), false);
});

test("an aligned voxet through the lattice gives the same blocks as read directly (z up and ZPOSITIVE Depth)", () => {
  for (const extra of [[], ["GOCAD_ORIGINAL_COORDINATE_SYSTEM", "ZPOSITIVE Depth", "END_ORIGINAL_COORDINATE_SYSTEM"]]) {
    const h = parseVoxetHeader(hdr("30 0 0", "0 10 0", "3 2 2", extra)), vals = Float64Array.from({ length: 12 }, (_, i) => i), L = alignedLattice(h);
    assert.deepEqual(key(voxetToUbc(L.header, resampleVoxet(L, vals))), key(voxetToUbc(h, vals)));
  }
});

test("a voxet turned 45°: every node's value sits at its own place; the box's corners outside the voxet stay empty", () => {
  const s = 28.2842712, h = parseVoxetHeader(hdr(`${s} ${s} 0`, `-${s} ${s} 0`, "5 5 1"));
  const vals = Float64Array.from({ length: 25 }, (_, i) => (i % 5) + 10 * Math.floor(i / 5)), L = alignedLattice(h);
  assert.equal(Math.round(L.rotationDeg), 45);
  const cells = ubcMeshToCells(...(({ mesh, values }) => [mesh, Array.from(values)])(voxetToUbc(L.header, resampleVoxet(L, vals))));
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const x = 100 + (i - j) * 7.0710678, y = 200 + (i + j) * 7.0710678;
    const c = cells.reduce((b, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(b.x - x, b.y - y) ? q : b));
    assert.equal(c.value, i + 10 * j, `node ${i},${j}`);
  }
  assert.ok(!cells.some((c) => c.x < 75 && c.y < 175), "the south-west corner of the box is outside the voxet");
});

test("no node is lost at other angles and unequal steps", () => {
  for (const [deg, su, sv] of [[30, 80, 40], [17, 40, 40], [80, 60, 20]]) {
    const r = (deg * Math.PI) / 180, h = parseVoxetHeader(hdr(`${Math.cos(r) * su} ${Math.sin(r) * su} 0`, `${-Math.sin(r) * sv} ${Math.cos(r) * sv} 0`, "5 5 4"));
    const out = resampleVoxet(alignedLattice(h), Float64Array.from({ length: 100 }, (_, i) => i));
    assert.equal(new Set([...out].filter(Number.isFinite)).size, 100, `${deg}°`);
  }
});

test("a lattice past the node budget is coarsened evenly; flat axes are refused", () => {
  const L = alignedLattice(parseVoxetHeader(hdr("2121 2121 0", "-2121 2121 0", "301 301 2")), { maxNodes: 1e5 });
  assert.ok(L.map.length <= 1e5 && L.coarsened);
  assert.throws(() => alignedLattice(parseVoxetHeader(hdr("10 10 0", "20 20 0", "3 3 2"))), /flat/);
});

test("the drop resamples a rotated voxet and says so", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const lattice = vx\.isVoxetAligned\(h\) \? null : vx\.alignedLattice\(h\)/);
  assert.match(u, /tr\("The Voxet is rotated \(\{deg\}° from east in plan\)/);
});
