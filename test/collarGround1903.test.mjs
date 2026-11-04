// TASKS.csv #1903 — the collar ground's bucket search gives the sorted answer, in a fraction of the time
import test from "node:test";
import assert from "node:assert/strict";
import { collarGround } from "../src/lib/pitShell.js";
import { stringsFromDxf } from "../src/lib/designStrings.js";

function brute(pts) {
  return (x, y) => {
    const near = pts.map((c) => [Math.hypot(c.x - x, c.y - y), c.z]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    if (near[0][0] < 1e-6) return near[0][1];
    let w = 0, s = 0;
    for (const [d, z] of near) { const k = 1 / (d * d); w += k; s += k * z; }
    return s / w;
  };
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test("the four nearest collars by bucket equal the four nearest by sorting, inside and outside the collars' box", () => {
  const pts = Array.from({ length: 446 }, () => ({ x: 600000 + rnd() * 6000, y: 6350000 + rnd() * 7000, z: 1500 + rnd() * 400 }));
  pts.push({ x: 603000, y: 6353500, z: 1234 }); // a collar to land on exactly
  const fast = collarGround(pts), slow = brute(pts);
  for (let k = 0; k < 3000; k++) {
    const x = 598000 + rnd() * 10000, y = 6348000 + rnd() * 11000;
    assert.ok(Math.abs(fast(x, y) - slow(x, y)) < 1e-9, `at ${x}, ${y}: ${fast(x, y)} vs ${slow(x, y)}`);
  }
  assert.equal(fast(603000, 6353500), 1234);
  assert.ok(Math.abs(fast(603000, 6353500 + 0.5) - slow(603000, 6353500.5)) < 1e-9);
  // a handful of collars, and collars on one line (a zero-area box)
  const few = pts.slice(0, 3);
  assert.ok(Math.abs(collarGround(few)(601000, 6351000) - brute(few)(601000, 6351000)) < 1e-9);
  const line = Array.from({ length: 20 }, (_, i) => ({ x: 600000 + i * 50, y: 6350000, z: 1500 + i }));
  assert.ok(Math.abs(collarGround(line)(600420, 6350300) - brute(line)(600420, 6350300)) < 1e-9);
});

test("40,000 ground samples over 446 collars take well under a second", () => {
  const pts = Array.from({ length: 446 }, () => ({ x: 600000 + rnd() * 6000, y: 6350000 + rnd() * 7000, z: 1500 + rnd() * 400 }));
  const g = collarGround(pts);
  const t0 = performance.now();
  let s = 0;
  for (let j = 0; j < 200; j++) for (let i = 0; i < 200; i++) s += g(602000 + i * 1.5, 6353000 + j * 1.5);
  const ms = performance.now() - t0;
  assert.ok(Number.isFinite(s));
  assert.ok(ms < 1000, `${ms} ms`);
});

test("a 2D DXF polyline takes the ground function and is flagged flat; a lone polyline on a layer keeps the layer's name (#1906, #1914)", () => {
  const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE", "8", "CLAIM", "70", "1", "90", "3", "10", "100", "20", "200", "10", "300", "20", "200", "10", "300", "20", "400",
    "0", "POLYLINE", "8", "DECLINE", "70", "8", "0", "VERTEX", "8", "DECLINE", "10", "0", "20", "0", "30", "50", "0", "VERTEX", "8", "DECLINE", "10", "10", "20", "0", "30", "40", "0", "SEQEND", "0", "ENDSEC", "0", "EOF"].join("\n");
  const r = stringsFromDxf(dxf, { zDefault: (x, y) => x + y, baseName: "file" });
  assert.equal(r.strings.length, 2);
  assert.deepEqual(r.strings.map((s) => s.name), ["CLAIM", "DECLINE"]);
  assert.equal(r.flat, 1);
  assert.ok(r.strings[0].flat && !r.strings[1].flat);
  assert.deepEqual(r.strings[0].vertices[0], [100, 200, 300]);
  assert.deepEqual(r.strings[1].vertices[0], [0, 0, 50]);
  const one = stringsFromDxf(dxf.replace("\nDECLINE\n70\n8", "\nDECLINE\n70\n8").split("0\nPOLYLINE")[0] + "0\nENDSEC\n0\nEOF", { zDefault: 5, baseName: "file" });
  assert.equal(one.strings[0].name, "CLAIM", "one polyline on a named layer is named after the layer");
});
