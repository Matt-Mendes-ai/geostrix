// TASKS.csv #2945 (review #2876 modelA-2) — the stall when a GemPy result lands, the rest of it: the collar ground (idwGround) asked per
// bisection step and per column without allocating; the log's stamp computed once per array; the Alteration pane's code lists no longer
// re-scanned over the whole log when a run adds a custom layer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwGround } from "../src/lib/pitShell.js";
import { layerStamp } from "../src/lib/layerStamp.js";

test("idwGround: the four nearest, inverse distance squared, as a brute force over every collar", () => {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 400 }, () => ({ x: rnd() * 3000, y: rnd() * 2000, z: 300 + rnd() * 80 }));
  const g = idwGround(pts);
  const brute = (x, y) => {
    const d = pts.map((p) => [Math.hypot(p.x - x, p.y - y), p.z]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    if (d[0][0] < 1e-6) return d[0][1];
    let w = 0, s = 0; for (const [r, z] of d) { w += 1 / (r * r); s += z / (r * r); } return s / w;
  };
  for (let k = 0; k < 300; k++) { const x = rnd() * 3400 - 200, y = rnd() * 2400 - 200; assert.ok(Math.abs(g(x, y) - brute(x, y)) < 1e-9, `at ${x}, ${y}`); }
  assert.equal(g(pts[7].x, pts[7].y), pts[7].z, "at a collar: its own elevation");
  const two = idwGround([{ x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 20 }]);
  assert.ok(Math.abs(two(5, 0) - 15) < 1e-12, "fewer than four collars");
  assert.equal(idwGround([]), null);
});

test("the log's stamp: once per array, a new array a new stamp", () => {
  const rows = [{ hole_id: "A", from: 0, to: 2, value: "X" }, { hole_id: "A", from: 2, to: 5, value: "Y" }];
  const s1 = layerStamp(rows);
  assert.equal(layerStamp(rows), s1);
  const edited = rows.map((r, i) => (i === 1 ? { ...r, value: "Z" } : r));
  assert.notEqual(layerStamp(edited), s1);
  assert.equal(layerStamp([...rows]), s1, "the same rows in a new array: the same stamp");
  assert.equal(layerStamp(null), "0:" + layerStamp([]).split(":")[1]);
});

test("wiring: the Alteration pane's rows follow the chosen custom layer only; 'not logged' is tested once per code", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const altCustomRows = useMemo\(\(\) => \(altSource\.layer\.startsWith\("custom:"\)/);
  assert.match(p, /storeLayers\.weath, altCustomRows\]\);/);
  assert.match(p, /const vals = new Set\(\); for \(const r of altSourceRows\) vals\.add\(String\(r\.value \?\? ""\)\);/);
});
