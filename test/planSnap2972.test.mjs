// TASKS.csv #2972 (WA iron review) — looking straight down, an interpretation click by a collar takes the collar, never a contact down
// the hole (in plan every contact of a vertical hole is under its collar)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapIndex, snapRay, isPlanLook } from "../src/lib/viewer/interpretSnap.js";

const origin = { x: 1000, y: 2000, z: 0 };
const sceneOf = (E, N, Z) => ({ x: E - origin.x, y: Z - origin.z, z: origin.y - N });
// a vertical hole whose collar is not in the index (its first trace point is at 2 m) — the case where a contact won before
const holeA = { hole_id: "A", pts: [{ md: 0, ...sceneOf(1100, 2000, 300) }, { md: 100, ...sceneOf(1100, 2000, 200) }] };
const layers = { litho: [{ hole_id: "A", from: 0, to: 34, value: "ALU" }, { hole_id: "A", from: 34, to: 100, value: "BNAM" }] };
const tol5 = () => 5;
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

test("a plan look: within 15° of vertical", () => {
  assert.equal(isPlanLook({ direction: { x: 0, y: -1, z: 0 } }), true);
  assert.equal(isPlanLook({ direction: unit(Math.tan((10 * Math.PI) / 180), -1, 0) }), true);
  assert.equal(isPlanLook({ direction: unit(1, -1, 0) }), false);
});

test("straight down, slightly off the collar: the collar, never 'A at 34 m (BNAM)' nor a trace point", () => {
  const idx = buildSnapIndex([holeA], layers, ["litho"], () => "Lithology");
  for (let k = 0; k < 20; k++) {
    const s = snapRay(idx, { origin: sceneOf(1100 + (k % 5) - 2, 2000 + (k % 3) - 1, 1300), direction: { x: 0, y: -1, z: 0 } }, tol5);
    assert.equal(s.kind, "collar"); assert.equal(s.md, 0);
  }
  // with only boundaries in reach (the collar left out of the index), a plan look snaps to nothing
  const noCollar = { ...idx, xyz: idx.xyz.slice(3), info: idx.info.slice(1) };
  assert.equal(snapRay(noCollar, { origin: sceneOf(1100, 2000, 1300), direction: { x: 0, y: -1, z: 0 } }, tol5), null);
});

test("an oblique look still takes the contact down the hole", () => {
  const idx = buildSnapIndex([holeA], layers, ["litho"], () => "Lithology");
  const s = snapRay(idx, { origin: sceneOf(900, 2000, 266), direction: { x: 1, y: 0, z: 0 } }, tol5);
  assert.equal(s.kind, "boundary"); assert.equal(s.md, 34);
});

test("the pane says so", () => {
  assert.match(readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8"), /Looking straight down \(Top view\) only collars are taken/);
});
