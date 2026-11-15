// TASKS.csv #3247 — a wheel zoom whose cursor ray misses every trace (the gaps of a dense block seen obliquely) closed on the reference plane behind
// the block and flew the camera through it; it now takes its depth from the holes' own points nearest the cursor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { wheelZoom, anchorOnRay, ANCHOR_RADIUS_PX } from "../src/modules/viewer/wheelZoom.js";
import { wheelAnchors, makeWheelAnchors, WHEEL_ANCHOR_CAP } from "../src/modules/viewer/wheelAnchors.js";

const W = 1600, H = 800, el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) };
const place = (cam, cs, az, elev) => { const { radius: r, target: t } = cs; cam.position.set(t.x + r * Math.cos(elev) * Math.sin(az), t.y + r * Math.sin(elev), t.z + r * Math.cos(elev) * Math.cos(az)); cam.lookAt(t); cam.updateMatrixWorld(true); cam.updateProjectionMatrix(); };
const scr = (cam, p) => { const v = new THREE.Vector3(p.x, p.y, p.z).project(cam); return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, behind: v.z > 1 }; };

// a dense block of "holes" 600 m above the plane through the orbit target, a 300 m cluster (collar + a few points per hole)
function block(cx, cy, cz) { const a = []; for (let i = 0; i < 400; i++) { const u = (i * 7919) % 400; a.push(cx + ((u % 20) - 10) * 15, cy + (((u / 20) | 0) - 10) * 15, cz + ((i % 9) - 4) * 20); } return Float32Array.from(a); }
function run(elevDeg, anchors, ticks = 8) {
  const cam = new THREE.PerspectiveCamera(50, W / H, 1, 1e7), cs = { radius: 4000, target: new THREE.Vector3(0, 0, 0) }, az = 0.6, ev = (elevDeg * Math.PI) / 180;
  place(cam, cs, az, ev);
  const centre = { x: 0, y: 600, z: 0 }, s0 = scr(cam, centre);
  for (let i = 0; i < ticks; i++) { wheelZoom({ deltaY: -300, clientX: s0.x + 4, clientY: s0.y + 4 }, el, cam, new THREE.Raycaster(), cs, () => null, { anchors }); place(cam, cs, az, ev); }
  const dist = cam.position.distanceTo(new THREE.Vector3(centre.x, centre.y, centre.z)), view = new THREE.Vector3(); cam.getWorldDirection(view);
  const all = block(0, 600, 0); let n = 0; for (let i = 0; i < all.length; i += 3) if (view.dot(new THREE.Vector3(all[i], all[i + 1], all[i + 2]).sub(cam.position)) > 0) n++;
  return { dist, share: n / (all.length / 3) }; // the share of the block's points still in front of the camera
}

test("without the anchors the plane behind the block takes the zoom through it (the reproduction); with them the block stays ahead", () => {
  const anchors = block(0, 600, 0);
  for (const elev of [60, 30, 15]) {
    const old = run(elev, null), now = run(elev, anchors);
    assert.ok(old.share < 0.05, `${elev}°: the camera passed the block with the plane fallback (${old.share})`);
    assert.ok(now.share > 0.4, `${elev}°: the block is still around the camera's view, not behind it (${now.share})`);
  }
});

test("anchorOnRay: nothing within the radius, behind the camera, or no anchors -> null; the nearest on screen wins; the cursor's own ray is kept", () => {
  const cam = new THREE.PerspectiveCamera(50, W / H, 1, 1e7), cs = { radius: 4000, target: new THREE.Vector3() };
  place(cam, cs, 0.6, 0.5);
  const rc = new THREE.Raycaster(); rc.setFromCamera({ x: 0, y: 0 }, cam);
  const rect = el.getBoundingClientRect();
  assert.equal(anchorOnRay(rc.ray, cam, null, rect, 800, 400), null);
  assert.equal(anchorOnRay(rc.ray, cam, new Float32Array(0), rect, 800, 400), null);
  const far = Float32Array.from([3000, 0, 0]); // far to the side: more than the radius from the cursor
  assert.equal(anchorOnRay(rc.ray, cam, far, rect, 800, 400), null);
  const behind = cam.position.clone().addScaledVector(rc.ray.direction, -500); // behind the camera
  assert.equal(anchorOnRay(rc.ray, cam, Float32Array.from([behind.x, behind.y, behind.z]), rect, 800, 400), null);
  const onRay = rc.ray.origin.clone().addScaledVector(rc.ray.direction, 1500), near = onRay.clone().add(new THREE.Vector3(0, 10, 0));
  const p = anchorOnRay(rc.ray, cam, Float32Array.from([near.x, near.y, near.z, 9e3, 9e3, 9e3]), rect, 800, 400);
  assert.ok(p && Math.abs(new THREE.Vector3(p.x, p.y, p.z).sub(rc.ray.origin).length() - 1500) < 15, "the depth of the anchor, on the cursor's ray");
  const onThe = new THREE.Vector3(p.x, p.y, p.z).sub(rc.ray.origin).normalize();
  assert.ok(onThe.distanceTo(rc.ray.direction) < 1e-9, "the point is on the ray");
  assert.ok(ANCHOR_RADIUS_PX >= 30);
});

test("a hit still wins over the anchors; with vertical exaggeration the screen test uses the camera's own view matrix", () => {
  const cam = new THREE.PerspectiveCamera(50, W / H, 1, 1e7), cs = { radius: 1000, target: new THREE.Vector3() };
  place(cam, cs, 0.6, 0.5);
  const hit = { x: 50, y: 20, z: 0 }, s = scr(cam, hit);
  wheelZoom({ deltaY: -200, clientX: s.x, clientY: s.y }, el, cam, new THREE.Raycaster(), cs, () => hit, { anchors: Float32Array.from([0, 500, 0]) }); place(cam, cs, 0.6, 0.5);
  const a = scr(cam, hit);
  assert.ok(Math.hypot(a.x - s.x, a.y - s.y) < 0.5);
});

test("wheelAnchors: the visible holes' points, thinned to the cap with each hole's end kept; remembered until the inputs change", () => {
  const mk = (id, n) => ({ hole_id: id, pts: Array.from({ length: n }, (_, i) => ({ x: i, y: -i, z: 0 })) });
  const traces = [mk("A", 10), mk("B", 10), mk("C", 10)];
  const all = wheelAnchors(traces, {});
  assert.equal(all.length, 90);
  const noB = wheelAnchors(traces, { B: false });
  assert.equal(noB.length, 60);
  const big = [mk("X", 100000), mk("Y", 100000)];
  const thin = wheelAnchors(big, {});
  assert.ok(thin.length / 3 <= WHEEL_ANCHOR_CAP + 4 && thin.length / 3 > WHEEL_ANCHOR_CAP / 2);
  assert.equal(thin[thin.length - 3], 99999, "the end of the last hole is kept");
  const get = makeWheelAnchors(), vis = {};
  assert.equal(get(traces, vis), get(traces, vis));
  assert.notEqual(get(traces, vis), get([...traces], vis));
});

test("wiring: the viewer passes the traces and the visible holes to the wheel zoom", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /anchors: \(\) => wheelAnchorsFor\(tracesRef\.current, visibleHolesRef\.current\), boxes: \(\) => wheelBoxes\(\[voxelGroupRef\.current, omfGroupRef\.current\]\)/); // #3669
  assert.match(v, /import \{ makeWheelAnchors, wheelBoxes \} from "\.\/viewer\/wheelAnchors\.js"/);
});

// ---- TASKS.csv #3669 — the shown block / OMF models' boxes as the fallback when no hole is near the cursor
import { boxOnRay } from "../src/modules/viewer/wheelZoom.js";
import { wheelBoxes } from "../src/modules/viewer/wheelAnchors.js";

test("boxOnRay: the entry of the nearest box ahead, halfway to the exit from inside, null on a miss, behind or no boxes", () => {
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
  const box = (z0, z1) => [-10, -10, z0, 10, 10, z1]; // z0 < z1
  const p = boxOnRay(ray, Float32Array.from([...box(-300, -200), ...box(-150, -100)]));
  assert.ok(p && Math.abs(p.z + 100) < 1e-9, "the nearer box's entry (z = -100)"); // the -150..-100 box is nearer
  const inside = boxOnRay(ray, Float32Array.from(box(-40, 60)));
  assert.ok(Math.abs(inside.z + 20) < 1e-9, "inside: halfway to the exit (z = -20)");
  assert.equal(boxOnRay(ray, Float32Array.from([50, 50, -300, 60, 60, -200])), null, "misses the box");
  assert.equal(boxOnRay(ray, Float32Array.from(box(100, 200))), null, "behind the camera");
  assert.equal(boxOnRay(ray, null), null);
  assert.equal(boxOnRay(ray, new Float32Array(0)), null);
});

test("a cursor in a gap of a block model with no hole near it: the camera converges on the block (the plane behind it would carry it through)", () => {
  const boxes = Float32Array.from([-150, 450, -150, 150, 750, 150]); // a 300 m block centred 600 m above the plane
  const behind = (cam, s) => { const v = new THREE.Vector3(); cam.getWorldDirection(v); return v.dot(new THREE.Vector3(0, 600, 0).sub(cam.position)) <= 0; };
  for (const elev of [60, 30, 15]) {
    const out = {};
    for (const mode of ["plane", "boxes"]) {
      const cam = new THREE.PerspectiveCamera(50, W / H, 1, 1e7), cs = { radius: 4000, target: new THREE.Vector3() }, az = 0.6, ev = (elev * Math.PI) / 180;
      place(cam, cs, az, ev);
      const s0 = scr(cam, { x: 0, y: 600, z: 0 });
      for (let i = 0; i < 8; i++) { wheelZoom({ deltaY: -300, clientX: s0.x + 3, clientY: s0.y + 3 }, el, cam, new THREE.Raycaster(), cs, () => null, mode === "boxes" ? { boxes } : {}); place(cam, cs, az, ev); }
      out[mode] = behind(cam);
    }
    assert.equal(out.plane, true, `${elev}°: the plane fallback carries the camera past the block`);
    assert.equal(out.boxes, false, `${elev}°: the box fallback keeps the block ahead`);
  }
});

test("wheelBoxes: the shown children's own boxes (a hidden group or model is left out)", () => {
  const mesh = (x, vis = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10)); m.position.set(x, 0, 0); m.updateMatrixWorld(true); m.visible = vis; return m; };
  const g = new THREE.Group(); g.add(mesh(0), mesh(100, false), mesh(200));
  const hidden = new THREE.Group(); hidden.visible = false; hidden.add(mesh(500));
  const b = wheelBoxes([g, hidden, null]);
  assert.equal(b.length, 12);
  assert.ok(Math.abs(b[0] + 5) < 1e-6 && Math.abs(b[6] - 195) < 1e-6);
  assert.equal(wheelBoxes([]).length, 0);
});
