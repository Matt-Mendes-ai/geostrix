// TASKS.csv #3896 (Matt's pick, 2026-11-20: "the terrain and the image vanish from below") — the terrain, its detail tiles and every drape on it
// are drawn from above only: their triangles face up and their materials are single-sided; the tiles' skirts face outward (the face seen across
// a crack) and are not drawn while the camera is under the tile; sections, holes and solids keep both sides
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { syncTerrain, terrainDrapeGeometry } from "../src/lib/viewer/sceneBuilders.js";
import { terrainTileGeometry, tileLowestY, cameraBelow, DEM_READ } from "../src/lib/viewer/lodTerrain.js";

// three's front face is counter-clockwise: its normal is (b - a) x (c - a)
function facing(geometry, matrix, from = 0, to = Infinity) {
  const p = geometry.attributes.position, idx = geometry.index.array, out = { up: 0, down: 0, side: [] };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = from; t < Math.min(to, idx.length); t += 3) {
    a.fromBufferAttribute(p, idx[t]).applyMatrix4(matrix); b.fromBufferAttribute(p, idx[t + 1]).applyMatrix4(matrix); c.fromBufferAttribute(p, idx[t + 2]).applyMatrix4(matrix);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue; // a degenerate sliver
    n.normalize();
    if (n.y > 0.3) out.up++; else if (n.y < -0.3) out.down++; else out.side.push(n);
  }
  return out;
}
// SYNTHETIC terrain: 2 x 2 km of rolling ground; a small grid (full) and a large one (the adaptive mesh)
const terrainOf = (W, H) => { const e = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) e[j * W + i] = 500 + 30 * Math.sin(i / 7) + 20 * Math.cos(j / 5); return { bbox: [500000, 6000000, 502000, 6002000], gridW: W, gridH: H, elevations: e }; };
const origin = { x: 501000, y: 6001000, z: 500 };

for (const [name, t] of [["a full grid", terrainOf(40, 40)], ["the adaptive mesh", terrainOf(600, 600)]]) {
  test(`${name}: the terrain and a drape on it face up, and are drawn front side only`, () => {
    const mesh = syncTerrain(new THREE.Group(), null, t, { origin });
    mesh.updateMatrixWorld(true);
    const f = facing(mesh.geometry, mesh.matrixWorld);
    assert.ok(f.up > 0 && f.down === 0 && f.side.length === 0, JSON.stringify({ up: f.up, down: f.down, side: f.side.length }));
    assert.equal(mesh.material.side, THREE.FrontSide);
    const cx = 501000, cy = 6001000, g = terrainDrapeGeometry(t, [500500, 6000500, 501500, 6001500], { cx, cy, oz: origin.z, base: 0.15 });
    const d = new THREE.Mesh(g); d.rotation.x = -Math.PI / 2; d.position.set(cx - origin.x, 0, -(cy - origin.y)); d.updateMatrixWorld(true); // as the drapes are placed
    const fd = facing(g, d.matrixWorld);
    assert.ok(fd.up > 0 && fd.down === 0, JSON.stringify({ up: fd.up, down: fd.down }));
  });
}

test("a detail tile: its grid faces up, its skirt faces outward, and its lowest point is known", () => {
  const S = DEM_READ, heights = new Float32Array(S * S).map((_, k) => 520 + (k % S) * 0.5); // the read grid: one node past every edge
  const tg = terrainTileGeometry(heights, [500000, 6000000, 501000, 6001000], origin, 30), I = new THREE.Matrix4();
  const grid = facing(tg.geometry, I, 0, tg.gridTris);
  assert.ok(grid.up > 0 && grid.down === 0, JSON.stringify({ up: grid.up, down: grid.down }));
  const p = tg.geometry.attributes.position, idx = tg.geometry.index.array, ctr = new THREE.Vector3(500500 - origin.x, 0, -(6000500 - origin.y));
  let out = 0, inward = 0;
  for (let k = tg.gridTris; k < idx.length; k += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, idx[k]), b = new THREE.Vector3().fromBufferAttribute(p, idx[k + 1]), c = new THREE.Vector3().fromBufferAttribute(p, idx[k + 2]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)), m = a.clone().add(b).add(c).divideScalar(3).sub(ctr);
    m.y = 0;
    if (n.dot(m) > 0) out++; else inward++;
  }
  assert.ok(out > 0 && inward === 0, `skirt: ${out} outward, ${inward} inward`);
  const lo = tileLowestY(tg.geometry, tg.gridTris);
  assert.ok(Math.abs(lo - (520 + 1 * 0.5 - origin.z)) < 1e-3, `lowest ${lo}`);
});

test("the camera is below a tile in the exaggerated frame as drawn", () => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 10, 0);
  assert.equal(cameraBelow(cam, 20), true);
  assert.equal(cameraBelow(cam, 5), false);
  // 5x about a pivot at 0: a tile whose lowest point is at 3 m is drawn at 15 m, so a camera at 10 m is under it
  cam.userData = { ve: 5, vePivotY: () => 0 };
  assert.equal(cameraBelow(cam, 3), true);
  assert.equal(cameraBelow(cam, 1), false);
  assert.equal(cameraBelow(null, 3), false);
});

test("wired: single-sided terrain and drape materials, the skirt hidden from below; sections keep both sides", () => {
  const sb = readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8");
  const lt = readFileSync(new URL("../src/lib/viewer/lodTerrain.js", import.meta.url), "utf8");
  const ld = readFileSync(new URL("../src/lib/viewer/lodDrape.js", import.meta.url), "utf8");
  assert.equal((sb.match(/color: terrain\.color \|\| "#8a7f68", side: THREE\.FrontSide/g) || []).length, 2, "both terrain meshes");
  assert.match(sb, /opacity: r\.opacity \?\? 0\.85, side: THREE\.FrontSide/); // raster drapes
  assert.match(sb, /opacity: l\.opacity \?\? 0\.6, side: THREE\.FrontSide/); // map-layer drapes
  assert.match(sb, /new THREE\.MeshBasicMaterial\(\{ map: texture, side: THREE\.DoubleSide, transparent: true, opacity: im\.opacity \?\? 1(, alphaTest: [\d.]+)? \}\)/, "the georeferenced section image keeps both sides");
  assert.match(lt, /color: terrain\.color \|\| "#8a7f68", side: THREE\.FrontSide/);
  assert.match(lt, /opacity: ov\.opacity, side: THREE\.FrontSide/);
  assert.match(lt, /t\.ground\.geometry\.setDrawRange\(0, cameraBelow\(camera, t\.minY\) \? t\.gridTris : Infinity\);/);
  assert.match(ld, /opacity: raster\.opacity \?\? 0\.85, side: THREE\.FrontSide/);
});
