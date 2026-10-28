// TASKS.csv #1058 — a fault with mixed triangle winding (a CAD 3DFACE soup) put picks on both sides at random
import { test } from "node:test";
import assert from "node:assert/strict";
import { orientMesh, validateSolid } from "../src/lib/meshValidate.js";
import { inputsBySide, faultNormalZ, fitBoundedSurface } from "../src/lib/explicitTrim.js";

// a vertical fault plane at E 500 (N 0-1000, Z -500..500), as a grid of quads; flipAlt: every other quad wound backwards;
// soup: every triangle with its own three vertices, as a 3DFACE soup is read
function fault({ flipAlt = false, soup = false } = {}) {
  const pos = [], idx = [], n = 10, at = (j, k) => [500, j * 100, -500 + k * 100];
  const vert = (p) => { pos.push(...p); return pos.length / 3 - 1; };
  const grid = [];
  if (!soup) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) grid.push(vert(at(j, k)));
  const V = (j, k) => (soup ? vert(at(j, k)) : grid[j * (n + 1) + k]);
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const back = flipAlt && (j + k) % 2 === 1;
    const tri = (a, b, c) => idx.push(...(back ? [V(...a), V(...c), V(...b)] : [V(...a), V(...b), V(...c)]));
    tri([j, k], [j + 1, k], [j + 1, k + 1]);
    tri([j, k], [j + 1, k + 1], [j, k + 1]);
  }
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}
const picks = Array.from({ length: 30 }, (_, i) => ({ x: 400 - (i % 5) * 20, y: 100 + (i % 6) * 140, z: -300 + (i % 7) * 90 }));

test("#1058 orientMesh leaves a consistent mesh alone and fixes a mixed one", () => {
  const good = fault();
  const r = orientMesh(good.positions, good.indices);
  assert.equal(r.flipped, 0);
  assert.deepEqual(Array.from(r.indices), Array.from(good.indices));
  for (const soup of [false, true]) {
    const mixed = fault({ flipAlt: true, soup });
    const m = orientMesh(mixed.positions, mixed.indices);
    assert.ok(m.flipped > 0);
    assert.equal(m.conflicts, 0);
    if (!soup) assert.equal(validateSolid(mixed.positions, m.indices).windingConflicts, 0);
  }
});

test("#1058 every pick west of a mixed-winding fault lands on one side", () => {
  for (const soup of [false, true]) {
    const mixed = fault({ flipAlt: true, soup });
    const a = inputsBySide(picks, mixed, 1), b = inputsBySide(picks, mixed, -1);
    assert.ok((a.keep.length === 30 && a.off.length === 0) || (b.keep.length === 30 && b.off.length === 0), `soup=${soup}: ${a.keep.length}/${b.keep.length}`);
    assert.ok(Math.abs(faultNormalZ(mixed)) < 1e-9); // vertical: the normal's z is zero either way
  }
});

test("#1058 a fault that cannot face one way is refused for a fault-bounded fit", () => {
  // a Mobius strip: no consistent winding exists
  const pos = [], idx = [], n = 24;
  for (let i = 0; i < n; i++) {
    const u = (2 * Math.PI * i) / n;
    for (const w of [-1, 1]) pos.push((100 + 30 * w * Math.cos(u / 2)) * Math.cos(u), (100 + 30 * w * Math.cos(u / 2)) * Math.sin(u), 30 * w * Math.sin(u / 2));
  }
  for (let i = 0; i < n; i++) {
    const a = 2 * i, b = 2 * i + 1, j = (i + 1) % n;
    const c = j === 0 ? 1 : 2 * j, d = j === 0 ? 0 : 2 * j + 1; // the half twist joins the strip back reversed
    idx.push(a, c, b, b, c, d);
  }
  const mob = { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
  assert.ok(orientMesh(mob.positions, mob.indices).conflicts > 0);
  assert.throws(() => fitBoundedSurface(picks, () => ({ positions: new Float64Array(0), indices: new Uint32Array(0) }), mob, 1), /cannot be turned to face one way/);
});
